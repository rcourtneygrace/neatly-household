import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../ui';
import { ActionSheet } from '../../ui/ActionSheet';
import { PhotoPicker } from '../../ui/PhotoPicker';
import { useObjectUrl } from '../../ui/useObjectUrl';
import { deleteRecord, saveRecord, usePhotos, useRecord } from '../../data/records';
import { MAX_PHOTOS_PER_RECORD, type ProcessedPhoto } from '../../data/photos';
import { RECORD_CATEGORIES, type DetailRow, type RecordCategory, type RecordLink } from '../../data/types';
import { chipLabels, isPhoneLabel, normalizeUrl, starterRows, switchCategory } from '../../domain/records';
import './record-form.css';

interface EditableRow extends DetailRow {
  key: number;
}

let rowKey = 0;
const withKeys = (rows: DetailRow[]): EditableRow[] => rows.map((r) => ({ ...r, key: ++rowKey }));

export function RecordFormScreen() {
  const { id } = useParams();
  const isEdit = !!id;
  const record = useRecord(id);
  if (isEdit && record === undefined) return null; // loading
  if (isEdit && record === null) return <Navigate to="/records" replace />;
  return <RecordForm key={record?.id ?? 'new'} existing={record ?? undefined} />;
}

function RecordForm({ existing }: { existing?: NonNullable<ReturnType<typeof useRecord>> }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCategory = (existing?.category ??
    (RECORD_CATEGORIES.includes(params.get('category') as RecordCategory)
      ? (params.get('category') as RecordCategory)
      : 'Paint & Finishes')) as RecordCategory;

  const [category, setCategory] = useState<RecordCategory>(initialCategory);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [rows, setRows] = useState<EditableRow[]>(() =>
    withKeys(existing ? existing.details : starterRows(initialCategory)),
  );
  const [links, setLinks] = useState<(RecordLink & { key: number })[]>(() =>
    (existing?.links ?? []).map((l) => ({ ...l, key: ++rowKey })),
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [keptPhotoIds, setKeptPhotoIds] = useState(existing?.photos ?? []);
  const [newPhotos, setNewPhotos] = useState<(ProcessedPhoto & { key: number })[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const keptPhotos = usePhotos(keptPhotoIds);

  const labelRefs = useRef(new Map<number, HTMLInputElement>());
  const valueRefs = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (focusKey !== null) {
      labelRefs.current.get(focusKey)?.focus();
      setFocusKey(null);
    }
  }, [focusKey]);

  // The row that gets suggestion chips: the last row with no label yet
  const blankLabelRow = [...rows].reverse().find((r) => r.label.trim() === '');
  const chips = useMemo(() => chipLabels(category, rows), [category, rows]);
  const photoCount = keptPhotoIds.length + newPhotos.length;

  const updateRow = (key: number, change: Partial<DetailRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const addDetail = () => {
    const row = { label: '', value: '', key: ++rowKey };
    setRows((rs) => [...rs, row]);
    setFocusKey(row.key);
  };

  const pickChip = (label: string) => {
    if (blankLabelRow) {
      updateRow(blankLabelRow.key, { label });
      requestAnimationFrame(() => valueRefs.current.get(blankLabelRow.key)?.focus());
    } else {
      const row = { label, value: '', key: ++rowKey };
      setRows((rs) => [...rs, row]);
      requestAnimationFrame(() => valueRefs.current.get(row.key)?.focus());
    }
  };

  const changeCategory = (next: RecordCategory) => {
    setCategory(next);
    setRows((rs) => {
      const switched = switchCategory(rs, next);
      // keep keys for rows that survived so typed values and focus are untouched
      return switched.map((d) => rs.find((r) => r.label === d.label && r.value === d.value) ?? { ...d, key: ++rowKey });
    });
  };

  const onSave = async () => {
    setError(undefined);
    if (!title.trim()) {
      setError('Add a name to save this record.');
      return;
    }
    const cleanLinks: RecordLink[] = [];
    for (const l of links) {
      if (!l.url.trim() && !l.label.trim()) continue;
      const url = normalizeUrl(l.url);
      if (!url) {
        setError('One of the links is not a web address. Check it or remove it.');
        return;
      }
      cleanLinks.push({ label: l.label.trim(), url });
    }
    setSaving(true);
    try {
      const savedId = await saveRecord(
        {
          title,
          category,
          details: rows.map(({ label, value }) => ({ label, value })),
          links: cleanLinks,
          notes,
          keptPhotoIds,
          newPhotos,
        },
        existing?.id,
      );
      if (existing) navigate(-1);
      else navigate(`/records/${savedId}`, { replace: true });
    } catch {
      setError('Something went wrong saving. Please try again.');
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    await deleteRecord(existing.id);
    navigate('/records', { replace: true });
  };

  return (
    <div className="sheet-screen">
      <form
        className="sheet"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="sheet__handle" aria-hidden />
        <h1 className="sheet__title">{existing ? 'Edit record' : 'Add record'}</h1>

        <label className="field">
          <span className="field__label">Category</span>
          <span className="select-wrap">
            <select value={category} onChange={(e) => changeCategory(e.target.value as RecordCategory)}>
              {RECORD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={18} />
          </span>
        </label>

        <label className="field field--gap">
          <span className="field__label">Name</span>
          <input
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus={!existing}
            autoComplete="off"
            enterKeyHint="next"
            required
            aria-required="true"
          />
        </label>

        <div className="details-head">
          <span>Details</span>
          {category !== 'Custom' && <span>Suggested for {category}</span>}
        </div>

        <div className="detail-rows">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="detail-input-row">
                <input
                  ref={(el) => {
                    if (el) labelRefs.current.set(r.key, el);
                    else labelRefs.current.delete(r.key);
                  }}
                  className={r.label ? 'detail-input-row__label' : 'detail-input-row__label is-new'}
                  value={r.label}
                  placeholder="Label"
                  aria-label="Label"
                  autoComplete="off"
                  onChange={(e) => updateRow(r.key, { label: e.target.value })}
                />
                <input
                  ref={(el) => {
                    if (el) valueRefs.current.set(r.key, el);
                    else valueRefs.current.delete(r.key);
                  }}
                  className="detail-input-row__value"
                  value={r.value}
                  placeholder="Value"
                  aria-label={r.label ? `${r.label} value` : 'Value'}
                  autoComplete="off"
                  inputMode={isPhoneLabel(r.label) ? 'tel' : undefined}
                  type={isPhoneLabel(r.label) ? 'tel' : 'text'}
                  onChange={(e) => updateRow(r.key, { value: e.target.value })}
                />
                <button
                  type="button"
                  className="detail-input-row__remove"
                  aria-label={`Remove ${r.label || 'detail'}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              {isPhoneLabel(r.label) && <p className="phone-hint">Shows a Call button on the record</p>}
            </div>
          ))}
        </div>

        {blankLabelRow && chips.length > 0 && (
          <div className="chips-block">
            <p className="chips-hint">Tap a label to use it, or type your own</p>
            <div className="chips">
              {chips.map((c) => (
                <button key={c} type="button" className="chip" onClick={() => pickChip(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="text-action" onClick={addDetail}>
          <Icon name="plus" size={16} />
          Add detail
        </button>

        {links.length > 0 && (
          <div className="link-rows">
            {links.map((l) => (
              <div className="link-row" key={l.key}>
                <input
                  className="text-input"
                  value={l.label}
                  placeholder="Button text, e.g. Buy on Amazon"
                  aria-label="Link button text"
                  onChange={(e) => setLinks((ls) => ls.map((x) => (x.key === l.key ? { ...x, label: e.target.value } : x)))}
                />
                <div className="link-row__url">
                  <input
                    className="text-input"
                    value={l.url}
                    placeholder="Web address"
                    aria-label="Web address"
                    type="url"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    onChange={(e) => setLinks((ls) => ls.map((x) => (x.key === l.key ? { ...x, url: e.target.value } : x)))}
                  />
                  <button
                    type="button"
                    className="detail-input-row__remove"
                    aria-label="Remove link"
                    onClick={() => setLinks((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {photoCount > 0 && (
          <div className="form-photos" role="group" aria-label="Photos">
            {keptPhotos?.map((p) => (
              <FormThumb key={p.id} blob={p.thumb} onRemove={() => setKeptPhotoIds((ids) => ids.filter((x) => x !== p.id))} />
            ))}
            {newPhotos.map((p) => (
              <FormThumb key={p.key} blob={p.thumb} onRemove={() => setNewPhotos((ps) => ps.filter((x) => x.key !== p.key))} />
            ))}
          </div>
        )}

        <div className="link-photo">
          <button
            type="button"
            className="soft-button"
            onClick={() => setLinks((ls) => [...ls, { label: '', url: '', key: ++rowKey }])}
          >
            <Icon name="link" size={18} />
            Add link
          </button>
          <button
            type="button"
            className="soft-button"
            disabled={photoCount >= MAX_PHOTOS_PER_RECORD}
            onClick={() => setPickerOpen(true)}
          >
            <Icon name="camera" size={18} />
            Add photo
          </button>
        </div>

        <label className="field">
          <span className="field__label">Notes (optional)</span>
          <textarea
            className="text-input textarea"
            value={notes}
            placeholder="Anything else worth remembering"
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="preview-box">
          <p className="preview-box__title">How this will show up</p>
          <p>
            Appears under {category === 'Custom' ? 'Custom' : category}. Brand, color and finish are just starting points.
            Change or add your own anytime.
          </p>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {existing && (
          <button type="button" className="delete-text" onClick={() => setConfirmDelete(true)}>
            Delete record
          </button>
        )}

        <div className="sheet__spacer" />
        <div className="sheet__actions">
          <button type="button" className="cancel-button" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="save-button" disabled={saving}>
            {existing ? 'Save changes' : 'Save record'}
          </button>
        </div>
      </form>

      <PhotoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        remaining={MAX_PHOTOS_PER_RECORD - photoCount}
        onPicked={(ps) => setNewPhotos((cur) => [...cur, ...ps.map((p) => ({ ...p, key: ++rowKey }))])}
      />

      <ActionSheet
        open={confirmDelete}
        title={`Delete “${existing?.title}”?`}
        message="This removes the record and its photos from this phone."
        onClose={() => setConfirmDelete(false)}
        actions={[{ label: 'Delete record', tone: 'clay', onSelect: onDelete }]}
      />
    </div>
  );
}

function FormThumb({ blob, onRemove }: { blob: Blob; onRemove: () => void }) {
  const url = useObjectUrl(blob);
  return (
    <div className="form-thumb">
      {url && <img src={url} alt="" />}
      <button type="button" className="form-thumb__remove" aria-label="Remove photo" onClick={onRemove}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

