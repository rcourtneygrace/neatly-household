import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CallButton, Icon } from '../../ui';
import { PhotoPicker } from '../../ui/PhotoPicker';
import { useObjectUrl } from '../../ui/useObjectUrl';
import { addPhotoToRecord, usePhotos, useRecord } from '../../data/records';
import { MAX_PHOTOS_PER_RECORD } from '../../data/photos';
import type { Photo } from '../../data/types';
import { isPhoneLabel } from '../../domain/records';
import './records.css';

export function RecordDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const record = useRecord(id);
  const photos = usePhotos(record?.photos);
  const [current, setCurrent] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Keep the selected photo in range when photos change
  useEffect(() => {
    if (photos && current >= photos.length) setCurrent(Math.max(0, photos.length - 1));
  }, [photos, current]);

  if (record === undefined) return null; // loading
  if (record === null) return <Navigate to="/records" replace />;

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/records'));
  const hasPhotos = (photos?.length ?? 0) > 0;
  const canAddPhoto = record.photos.length < MAX_PHOTOS_PER_RECORD;

  return (
    <main className="screen">
      <div className="record-detail">
        <header className="detail-header">
          <button type="button" className="back-button" onClick={goBack}>
            <Icon name="chevron-left" size={22} label="Back" />
          </button>
          <div className="detail-header__titles">
            <span className="detail-header__kicker">{record.category}</span>
            <h1 className="detail-header__title">{record.title}</h1>
          </div>
          <Link className="outline-button" to={`/records/${record.id}/edit`}>
            Edit
          </Link>
        </header>

        {hasPhotos && photos && (
          <>
            <PhotoHero photo={photos[current]} index={current} total={photos.length} />
            <div className="photo-thumbs" role="group" aria-label="Photos">
              {photos.map((p, i) => (
                <ThumbButton key={p.id} photo={p} index={i} selected={i === current} onSelect={() => setCurrent(i)} />
              ))}
              {canAddPhoto && (
                <button type="button" className="photo-add-tile" onClick={() => setPickerOpen(true)}>
                  <Icon name="plus" size={22} label="Add another photo" />
                </button>
              )}
            </div>
          </>
        )}

        {record.details.length > 0 && (
          <dl className="details-card">
            {record.details.map((d, i) => (
              <div className="details-card__row" key={i}>
                <dt className="details-card__label">{d.label}</dt>
                <dd className="details-card__value">
                  {d.value}
                  {isPhoneLabel(d.label) && <CallButton phone={d.value} name={record.title} />}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {record.links.length > 0 && (
          <div className="record-links">
            {record.links.map((l, i) => (
              <a key={i} className="outline-button outline-button--wide" href={l.url} target="_blank" rel="noopener noreferrer">
                <Icon name="link" size={18} />
                {l.label || l.url}
              </a>
            ))}
          </div>
        )}

        {record.notes && (
          <section className="record-notes">
            <h2 className="record-notes__label">Notes</h2>
            <p className="record-notes__text">{record.notes}</p>
          </section>
        )}
      </div>

      <PhotoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        remaining={MAX_PHOTOS_PER_RECORD - record.photos.length}
        onPicked={async (picked) => {
          for (const p of picked) await addPhotoToRecord(record.id, p);
          setCurrent(record.photos.length + picked.length - 1);
        }}
      />
    </main>
  );
}

function PhotoHero({ photo, index, total }: { photo?: Photo; index: number; total: number }) {
  const url = useObjectUrl(photo?.blob);
  return (
    <div className="photo-hero">
      {url && <img src={url} alt={`Photo ${index + 1} of ${total}`} />}
      {total > 1 && (
        <span className="photo-hero__count" aria-hidden>
          {index + 1} of {total}
        </span>
      )}
    </div>
  );
}

function ThumbButton({ photo, index, selected, onSelect }: { photo: Photo; index: number; selected: boolean; onSelect: () => void }) {
  const url = useObjectUrl(photo.thumb);
  return (
    <button type="button" className="photo-thumb" aria-current={selected} aria-label={`Show photo ${index + 1}`} onClick={onSelect}>
      {url && <img src={url} alt="" />}
    </button>
  );
}
