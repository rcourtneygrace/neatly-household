import { useRef, useState } from 'react';
import { ActionSheet } from './ActionSheet';
import { processPhoto, type ProcessedPhoto } from '../data/photos';

interface Props {
  open: boolean;
  onClose: () => void;
  onPicked: (photos: ProcessedPhoto[]) => void;
  /** How many more photos may be added */
  remaining: number;
}

/** "Take photo" / "Choose from library" sheet. Photos are resized on the device before saving. */
export function PhotoPicker({ open, onClose, onPicked, remaining }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      const picked = Array.from(files).slice(0, Math.max(0, remaining));
      const processed: ProcessedPhoto[] = [];
      for (const f of picked) processed.push(await processPhoto(f));
      onPicked(processed);
    } catch {
      setError('That photo could not be opened. Try another one.');
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (libraryRef.current) libraryRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple={remaining > 1}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <ActionSheet
        open={open}
        title="Add photo"
        onClose={onClose}
        actions={[
          { label: 'Take photo', onSelect: () => cameraRef.current?.click() },
          { label: 'Choose from library', onSelect: () => libraryRef.current?.click() },
        ]}
      />
      {busy && (
        <p className="photo-status" role="status">
          Saving photo…
        </p>
      )}
      {error && (
        <p className="photo-status" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
