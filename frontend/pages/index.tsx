import { useEffect, useMemo, useState } from 'react';

type Match = {
  id: string;
  score: number;
  model: string;
  view: string;
  label: string;
  signedImageUrl: string;
};

type ModelCandidate = {
  partId: string;
  model: string;
  aggregateScore: number;
  views: Match[];
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelCandidates, setModelCandidates] = useState<ModelCandidate[]>([]);
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [shownModelIndexes, setShownModelIndexes] = useState<number[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const canSearch = Boolean(selectedFile) && !isLoading;

  const apiBaseUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001'),
    []
  );
  const searchUrl = useMemo(() => {
    if (!apiBaseUrl) {
      return '';
    }
    return new URL('/search', apiBaseUrl).toString();
  }, [apiBaseUrl]);

  const handleFileChange = (file: File | null) => {
    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl);
    }
    setSelectedFile(file);
    setSelectedPreviewUrl(file ? URL.createObjectURL(file) : '');
    setModelCandidates([]);
    setActiveModelIndex(0);
    setShownModelIndexes([]);
    setFeedbackMessage('');
  };

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl);
      }
    };
  }, [selectedPreviewUrl]);

  const revealModelAtIndex = (index: number, candidates: ModelCandidate[]) => {
    const boundedIndex = Math.max(0, Math.min(index, Math.max(0, candidates.length - 1)));
    if (!candidates[boundedIndex]) {
      return;
    }
    setActiveModelIndex(boundedIndex);
    setShownModelIndexes((prev) => (prev.includes(boundedIndex) ? prev : [...prev, boundedIndex]));
  };

  const handleSearch = async () => {
    if (!selectedFile) {
      return;
    }
    if (!searchUrl) {
      return;
    }

    setIsLoading(true);
    setModelCandidates([]);
    setActiveModelIndex(0);
    setShownModelIndexes([]);
    setFeedbackMessage('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(searchUrl, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        // Keep UI clean; inspect backend terminal for detailed diagnostics.
        return;
      }
      const payload = await response.json();
      const candidates = (payload.modelCandidates || []) as ModelCandidate[];
      setModelCandidates(candidates);
      if (candidates.length > 0) {
        revealModelAtIndex(0, candidates);
      }
    } catch {
      // Keep UI clean; inspect backend terminal for detailed diagnostics.
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelFeedback = (isCorrect: boolean) => {
    if (isCorrect) {
      setFeedbackMessage('We are glad to help.');
      return;
    }

    const nextIndex = activeModelIndex + 1;
    if (nextIndex >= modelCandidates.length) {
      setFeedbackMessage('No other strong model candidates are available.');
      return;
    }

    revealModelAtIndex(nextIndex, modelCandidates);
    setFeedbackMessage(`Showing next model candidate (${nextIndex + 1}/${modelCandidates.length}).`);
  };

  const shownCandidates = shownModelIndexes
    .map((index) => ({ index, candidate: modelCandidates[index] }))
    .filter((item): item is { index: number; candidate: ModelCandidate } => Boolean(item.candidate));
  const totalShownViews = shownCandidates.reduce((acc, item) => acc + item.candidate.views.length, 0);

  return (
    <div className="page">
      <div className="glow" aria-hidden="true" />
      <main className="card">
        <header className="hero">
          <p className="kicker">Industrility</p>
          <h1>Visual Part Search</h1>
          <p className="subtitle">Upload a part photo to find closest match.</p>
        </header>

        {selectedPreviewUrl ? (
          <section className="query-preview">
            <p className="query-preview-title">Uploaded Query Image</p>
            <div className="query-preview-image">
              <img src={selectedPreviewUrl} alt={selectedFile?.name ?? 'Uploaded query image'} />
            </div>
          </section>
        ) : null}

        <section className="upload">
          <label
            className="upload-box"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0] ?? null;
              handleFileChange(file);
            }}
          >
            <div className="upload-icon">+</div>
            <div>
              <p className="upload-title">Drag & drop your part image</p>
              <p className="upload-subtitle">or click to choose a file</p>
              {selectedFile ? <p className="upload-file">{selectedFile.name}</p> : null}
            </div>
            <input
              className="file-input"
              type="file"
              accept="image/*"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              aria-label="Choose image file"
            />
          </label>
          <button
            className="search-button"
            type="button"
            onClick={handleSearch}
            disabled={!canSearch}
            style={{ cursor: canSearch ? 'pointer' : 'not-allowed' }}
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </section>

        <section className="results">
          <div className="results-header">
            <h2>Results</h2>
            <span className="results-meta">
              {isLoading
                ? 'Searching'
                : shownCandidates.length
                  ? `${totalShownViews} views | showing ${shownCandidates.length}/${Math.max(modelCandidates.length, 1)} models`
                  : 'Awaiting upload'}
            </span>
          </div>
          {!shownCandidates.length ? (
            <div className="results-empty">
              <div className="empty-box" />
              <p>No results yet. Upload an image to start searching.</p>
            </div>
          ) : null}
          {shownCandidates.length ? (
            <div>
              {shownCandidates.map(({ index, candidate }) => (
                <section key={candidate.partId + index} className="model-block">
                  <p className="model-block-title">
                    Candidate {index + 1}: {candidate.model} (score {candidate.aggregateScore.toFixed(4)})
                  </p>
                  <div className="results-grid">
                    {candidate.views.map((match) => (
                      <article key={match.id} className="result-card">
                        <div className="result-image">
                          <img src={match.signedImageUrl} alt={match.label} />
                        </div>
                        <div className="result-info">
                          <h3>{match.label}</h3>
                          <p>Score: {match.score.toFixed(4)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
          {shownCandidates.length ? (
            <div className="model-feedback">
              <p>Is this model correct?</p>
              <div className="model-feedback-actions">
                <button type="button" onClick={() => handleModelFeedback(true)}>
                  Yes
                </button>
                <button type="button" onClick={() => handleModelFeedback(false)}>
                  No
                </button>
              </div>
              {feedbackMessage ? <p className="model-feedback-message">{feedbackMessage}</p> : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
