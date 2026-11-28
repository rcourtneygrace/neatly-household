import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CallButton, Icon, PageHeader, PrimaryButton, SectionHeader } from '../../ui';
import { ShowDropdown } from '../../ui/ShowDropdown';
import { useObjectUrl } from '../../ui/useObjectUrl';
import { useFirstThumbs, useRecords } from '../../data/records';
import type { RecordEntry } from '../../data/types';
import { countLabel, groupByCategory, LIST_CATEGORIES, matchesSearch, phoneOf, summaryOf } from '../../domain/records';
import './records.css';

const ALL = 'all';

export function RecordsScreen() {
  const records = useRecords();
  const thumbs = useFirstThumbs(records);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const show = params.get('show') ?? ALL;
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const all = records ?? [];
    return [
      { value: ALL, label: 'All records', count: all.length },
      ...LIST_CATEGORIES.map((c) => ({ value: c, label: c, count: all.filter((r) => r.category === c).length })),
    ];
  }, [records]);

  const groups = useMemo(() => {
    const filtered = (records ?? []).filter(
      (r) => (show === ALL || r.category === show) && matchesSearch(r, query),
    );
    return groupByCategory(filtered);
  }, [records, show, query]);

  const setShow = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === ALL) next.delete('show');
    else next.set('show', value);
    setParams(next, { replace: true });
  };

  return (
    <main className="screen records-screen">
      <PageHeader title="Records" />

      <div className="screen__body records-controls">
        <label className="search-field">
          <Icon name="search" size={20} />
          <span className="visually-hidden">Search records</span>
          <input
            type="search"
            placeholder="Search paint, brands, contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
        </label>
        <ShowDropdown value={show} options={options} onChange={setShow} />
      </div>

      <div className="screen__body records-list">
        {records && records.length === 0 && <EmptyState />}
        {records && records.length > 0 && groups.length === 0 && (
          <p className="records-empty">No records match{query ? ` “${query.trim()}”` : ''}.</p>
        )}
        {groups.map((g) => (
          <section key={g.category} className="records-group" aria-label={g.category}>
            <SectionHeader className="records-group__header" title={g.category} count={countLabel(g.records.length)} />
            <ul className="records-group__rows">
              {g.records.map((r) => (
                <li key={r.id}>
                  <RecordRow record={r} thumb={thumbs?.get(r.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="records-add">
        <PrimaryButton icon="plus" onClick={() => navigate('/records/new' + (show !== ALL ? `?category=${encodeURIComponent(show)}` : ''))}>
          Add record
        </PrimaryButton>
      </div>
    </main>
  );
}

function RecordRow({ record, thumb }: { record: RecordEntry; thumb?: Blob }) {
  const phone = phoneOf(record);
  const thumbUrl = useObjectUrl(thumb);
  const summary = summaryOf(record);
  return (
    <div className={phone ? 'record-row record-row--call' : 'record-row'}>
      <Link to={`/records/${record.id}`} className="record-row__open">
        {thumbUrl && <img className="record-row__thumb" src={thumbUrl} alt="" />}
        <span className="record-row__text">
          <span className="record-row__title">{record.title}</span>
          {summary && <span className="record-row__summary">{summary}</span>}
        </span>
        {!phone && (
          <span className="record-row__chevron">
            <Icon name="chevron-right" size={22} />
          </span>
        )}
      </Link>
      {phone && <CallButton phone={phone} name={record.title} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="records-empty">
      <p className="records-empty__title">Keep the details of your home in one place</p>
      <p>Paint colors, filter sizes, warranties and the numbers you call. Tap Add record to start.</p>
    </div>
  );
}
