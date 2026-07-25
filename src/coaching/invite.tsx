// Sending the template to a client — the primary action of the coach app.
// One sheet with WhatsApp / email / copy / native share, all pre-written.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Mail, Link as LinkIcon, Check, X, Share2, QrCode } from 'lucide-react';
import { inviteText, portalLink, type CoachClient } from './api';

function ActionRow({
  icon,
  label,
  hint,
  onClick,
  href,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  done?: boolean;
}) {
  const inner = (
    <>
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {done ? <Check className="w-[18px] h-[18px]" /> : icon}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[14.5px] font-semibold text-[var(--text)]">{done ? 'Copied!' : label}</span>
        {hint && <span className="block text-[12.5px] text-[var(--text-muted)] truncate">{hint}</span>}
      </span>
    </>
  );
  const cls =
    'w-full flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)] transition-colors';
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} onClick={onClick}>
      {inner}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function InviteSheet({ client, onClose }: { client: CoachClient; onClose: () => void }) {
  const [copied, setCopied] = useState<'msg' | 'link' | null>(null);
  const msg = inviteText(client);
  const link = portalLink();

  const copy = async (what: 'msg' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'msg' ? msg : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share?.({ title: 'Your progress page', text: msg });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="relative w-full max-w-md rounded-3xl border border-[var(--border)] p-6"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="font-display text-[22px] font-bold tracking-tight text-[var(--text)]">
          Send {client.name.split(' ')[0]} their page
        </h2>
        <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
          They sign in with <b className="text-[var(--text)]">{client.email}</b> and land straight on their template.
        </p>

        <div className="flex flex-col gap-2 mt-5">
          <ActionRow
            icon={<MessageCircle className="w-[18px] h-[18px]" />}
            label="Send on WhatsApp"
            hint="Opens WhatsApp with the message ready"
            href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
          />
          <ActionRow
            icon={<Mail className="w-[18px] h-[18px]" />}
            label="Send by email"
            hint={client.email}
            href={`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent('Your progress page')}&body=${encodeURIComponent(msg)}`}
          />
          <ActionRow
            icon={<LinkIcon className="w-[18px] h-[18px]" />}
            label="Copy full message"
            hint="Paste into any app"
            onClick={() => copy('msg')}
            done={copied === 'msg'}
          />
          <ActionRow
            icon={<QrCode className="w-[18px] h-[18px]" />}
            label="Copy link only"
            hint={link}
            onClick={() => copy('link')}
            done={copied === 'link'}
          />
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <ActionRow
              icon={<Share2 className="w-[18px] h-[18px]" />}
              label="More sharing options"
              hint="Use your device's share sheet"
              onClick={nativeShare}
            />
          )}
        </div>

        <details className="mt-4 group">
          <summary className="text-[12.5px] font-semibold text-[var(--text-muted)] cursor-pointer hover:text-[var(--text)] transition-colors">
            Preview the message
          </summary>
          <pre className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap rounded-xl border border-[var(--border)] p-3 max-h-48 overflow-y-auto">
            {msg}
          </pre>
        </details>
      </motion.div>
    </div>
  );
}
