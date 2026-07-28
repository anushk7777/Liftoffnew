import { useState } from 'react';
import {
  Lightbulb,
  Plus,
  Trash2,
  Archive,
  ArchiveRestore,
  ListPlus,
  StickyNote,
  Pin,
  PinOff,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { fast, useReducedMotion } from '../lib/motion';
import { cn } from '../lib/utils';
import { PageHeader, Modal, EmptyState } from '../components/ui';
import type { Note } from '../store/data';

type Tab = 'inbox' | 'notes';

export default function BrainDump() {
  const [tab, setTab] = useState<Tab>('inbox');
  const rm = useReducedMotion();

  return (
    <div className="animate-rise">
      <PageHeader
        title="Brain Dump"
        subtitle="Catch every idea. Sort it out later."
        icon={<Lightbulb className="w-5 h-5" />}
      />

      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-elevated border border-border w-fit">
        <TabBtn active={tab === 'inbox'} onClick={() => setTab('inbox')} icon={<StickyNote className="w-4 h-4" />}>
          Inbox
        </TabBtn>
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')} icon={<FileText className="w-4 h-4" />}>
          Notes
        </TabBtn>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={rm ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={rm ? undefined : { opacity: 0, y: -6 }}
          transition={fast}
        >
          {tab === 'inbox' ? <Inbox /> : <Notes />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
        active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Inbox() {
  const { ideas, addIdea, deleteIdea, archiveIdea, convertIdeaToTask } = useStore();
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const visible = ideas.filter((i) => i.archived === showArchived);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addIdea(text.trim());
    setText('');
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="card p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder="Type an idea and hit ⌘/Ctrl + Enter…"
          aria-label="Capture an idea"
          rows={3}
          className="input resize-none border-0 focus:ring-0 focus:shadow-none bg-transparent"
        />
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary">
            <Plus className="w-4 h-4" /> Capture
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <h2 className="section-label">{showArchived ? 'Archived' : 'Inbox'}</h2>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="text-xs font-medium text-ink-muted hover:text-accent"
        >
          {showArchived ? 'Back to inbox' : `Archived (${ideas.filter((i) => i.archived).length})`}
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="w-7 h-7" />}
          title={showArchived ? 'Nothing archived' : 'Your inbox is clear'}
          hint={showArchived ? undefined : 'Capture fleeting thoughts here before they escape.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map((idea) => (
            <div key={idea.id} className="group card card-hover p-4 flex flex-col">
              <p className="text-sm text-ink whitespace-pre-wrap flex-1">{idea.text}</p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                <span className="text-[11px] text-ink-subtle">
                  {formatDistanceToNow(new Date(idea.createdAt), { addSuffix: true })}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!idea.archived && (
                    <button
                      onClick={() => convertIdeaToTask(idea.id)}
                      title="Convert to task"
                      className="p-1.5 rounded-md text-ink-subtle hover:text-accent hover:bg-hover"
                    >
                      <ListPlus className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => archiveIdea(idea.id, !idea.archived)}
                    title={idea.archived ? 'Restore' : 'Archive'}
                    className="p-1.5 rounded-md text-ink-subtle hover:text-ink hover:bg-hover"
                  >
                    {idea.archived ? (
                      <ArchiveRestore className="w-4 h-4" />
                    ) : (
                      <Archive className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteIdea(idea.id)}
                    title="Delete"
                    className="p-1.5 rounded-md text-ink-subtle hover:text-danger hover:bg-hover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notes() {
  const { notes, addNote, updateNote, deleteNote, togglePinNote } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const editing = notes.find((n) => n.id === editingId) || null;

  const handleNew = () => {
    const id = addNote();
    setEditingId(id);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={handleNew} className="btn btn-primary">
          <Plus className="w-4 h-4" /> New note
        </button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-7 h-7" />}
          title="No notes yet"
          hint="Write down longer thoughts, plans, or learnings."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((note) => (
            <button
              key={note.id}
              onClick={() => setEditingId(note.id)}
              className="group card card-hover p-4 text-left flex flex-col h-44"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-semibold text-ink truncate flex-1">
                  {note.title || 'Untitled'}
                </h3>
                {note.pinned && <Pin className="w-3.5 h-3.5 text-accent shrink-0" />}
              </div>
              <p className="text-sm text-ink-muted mt-2 flex-1 overflow-hidden whitespace-pre-wrap line-clamp-5">
                {note.content || <span className="text-ink-subtle italic">Empty note</span>}
              </p>
              <span className="text-[11px] text-ink-subtle mt-2">
                {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
              </span>
            </button>
          ))}
        </div>
      )}

      <NoteEditor
        note={editing}
        onClose={() => setEditingId(null)}
        onChange={(updates) => editing && updateNote(editing.id, updates)}
        onDelete={() => {
          if (editing) {
            deleteNote(editing.id);
            setEditingId(null);
          }
        }}
        onTogglePin={() => editing && togglePinNote(editing.id)}
      />
    </div>
  );
}

function NoteEditor({
  note,
  onClose,
  onChange,
  onDelete,
  onTogglePin,
}: {
  note: Note | null;
  onClose: () => void;
  onChange: (updates: Partial<Note>) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <Modal open={!!note} onClose={onClose} maxWidth="max-w-2xl">
      {note && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={onTogglePin}
              className="btn btn-ghost text-xs"
              title={note.pinned ? 'Unpin' : 'Pin'}
            >
              {note.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              {note.pinned ? 'Pinned' : 'Pin'}
            </button>
            <button onClick={onDelete} className="btn btn-ghost text-xs text-danger">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
          <input
            value={note.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Note title"
            className="w-full bg-transparent font-display text-2xl font-bold text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <textarea
            autoFocus
            value={note.content}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder="Start writing…"
            rows={14}
            className="w-full bg-transparent text-[15px] leading-relaxed text-ink placeholder:text-ink-subtle focus:outline-none resize-none"
          />
        </div>
      )}
    </Modal>
  );
}
