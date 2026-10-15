import { useState } from 'react';
import EAConfigPanel from './components/EAConfigPanel';
import FlowCanvas from './components/FlowCanvas';
import BlockLibrary from './components/BlockLibrary';
import LogicEditorModal from './components/LogicEditorModal';
import CodePreviewModal from './components/CodePreviewModal';

export default function App() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="app">
      <aside className="panel left">
        <EAConfigPanel onGenerate={() => setPreviewOpen(true)} />
      </aside>
      <main className="center">
        <FlowCanvas />
      </main>
      <aside className="panel right">
        <BlockLibrary onAddLogic={() => setEditorOpen(true)} />
      </aside>

      {editorOpen && <LogicEditorModal onClose={() => setEditorOpen(false)} />}
      {previewOpen && <CodePreviewModal onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}
