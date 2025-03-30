import { useState, useEffect } from 'react';

export default function DebugPanel({ projectId }) {
  const [debugInfo, setDebugInfo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    const fetchDebugInfo = async () => {
      if (!projectId) return;
      
      try {
        const response = await fetch(`http://localhost:3001/api/projects/${projectId}/status`);
        const data = await response.json();
        setDebugInfo(data);
      } catch (error) {
        console.error('Debug info fetch error:', error);
      }
    };

    fetchDebugInfo();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDebugInfo, 2000);
      return () => clearInterval(interval);
    }
  }, [projectId, autoRefresh]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-neutral-900 text-white px-3 py-2 rounded-lg"
      >
        Debug Panel
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Debug Panel</h3>
        <button onClick={() => setIsOpen(false)}>×</button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <label>Auto-refresh</label>
        </div>

        {debugInfo ? (
          <>
            <div>
              <strong>Status:</strong> {debugInfo.status}
              {debugInfo.error && (
                <div className="text-red-500 text-sm">{debugInfo.error}</div>
              )}
            </div>

            <div className="max-h-64 overflow-auto">
              <strong>Logs:</strong>
              {debugInfo.logs.map((log, i) => (
                <div
                  key={i}
                  className={`text-sm ${
                    log.type === 'error' ? 'text-red-500' : 'text-neutral-600'
                  }`}
                >
                  {new Date(log.timestamp).toLocaleTimeString()}: {log.message}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div>Loading debug info...</div>
        )}
      </div>
    </div>
  );
} 