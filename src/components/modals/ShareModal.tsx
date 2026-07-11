import React, { useEffect, useState } from 'react';
import { useEscClose } from '../../hooks/useEscClose';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  description?: string;
}

export default function ShareModal({ isOpen, onClose, url, title, description }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [originUrl, setOriginUrl] = useState(url);

  useEffect(() => {
    setOriginUrl(url);
  }, [url]);

  useEscClose(isOpen, onClose, isOpen);

  const shareText = title || 'Check out this API documentation';
  const shareDesc = description || shareText;

  const encodedUrl = encodeURIComponent(originUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedDesc = encodeURIComponent(shareDesc);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(originUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = originUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({
          title: shareText,
          text: shareDesc,
          url: originUrl,
        });
      } catch {
        // user cancelled
      }
    }
  };

  const shareOptions = [
    {
      name: 'WhatsApp',
      icon: 'ph-fill ph-whatsapp-logo',
      color: '#25D366',
      url: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${originUrl}`)}`,
    },
    {
      name: 'Telegram',
      icon: 'ph-fill ph-telegram-logo',
      color: '#0088cc',
      url: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      name: 'Email',
      icon: 'ph-fill ph-envelope',
      color: '#EA4335',
      url: `mailto:?subject=${encodedText}&body=${encodeURIComponent(`${shareDesc}\n\n${originUrl}`)}`,
    },
    {
      name: 'X (Twitter)',
      icon: 'ph-fill ph-x-logo',
      color: '#000000',
      url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      name: 'Facebook',
      icon: 'ph-fill ph-facebook-logo',
      color: '#1877F2',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: 'LinkedIn',
      icon: 'ph-fill ph-linkedin-logo',
      color: '#0A66C2',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      name: 'Reddit',
      icon: 'ph-fill ph-reddit-logo',
      color: '#FF4500',
      url: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    },
    {
      name: 'Pinterest',
      icon: 'ph-fill ph-pinterest-logo',
      color: '#E60023',
      url: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedDesc}`,
    },
  ];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[3px] animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 bg-[var(--surface)] border-[var(--border)] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b shrink-0 border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center gap-3">
            <span className="size-9 rounded-xl flex items-center justify-center bg-[var(--primary)]/10 text-[var(--primary)]">
              <i className="ph-fill ph-share-network text-[18px]"></i>
            </span>
            <div>
              <h3 className="font-bold text-sm text-[var(--text-heading)]">Share</h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[240px]">{title || 'Share this link'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-[var(--text-muted)]"
            title="Close"
          >
            <i className="ph ph-x"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto scrollbar-thin">
          {/* Link with copy */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Link</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={originUrl}
                  readOnly
                  className="w-full pl-3 pr-9 py-2.5 text-xs rounded-xl border outline-none font-mono select-all bg-[var(--background)] border-[var(--border)] text-[var(--text)]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <i className="ph ph-link text-[14px]"></i>
                </span>
              </div>
              <button
                onClick={handleCopy}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none shrink-0 ${
                  copied
                    ? 'bg-[var(--method-get)] text-white'
                    : 'bg-[var(--primary)] text-[var(--primary-contrast)] hover:opacity-90'
                }`}
                title="Copy link"
              >
                <i className={`ph ${copied ? 'ph-check' : 'ph-copy'} text-[14px]`}></i>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {description && (
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)] mt-2 line-clamp-3">{description}</p>
            )}
          </div>

          {/* Share options grid */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              Share via
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {shareOptions.map((opt) => (
                <a
                  key={opt.name}
                  href={opt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border hover:shadow-sm transition-all cursor-pointer select-none bg-[var(--background)] border-[var(--border)] hover:border-[var(--primary)]/30 hover:bg-[var(--surface-hover)] group"
                  title={`Share on ${opt.name}`}
                >
                  <span
                    className="size-9 rounded-full flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: opt.color }}
                  >
                    <i className={`${opt.icon} text-[18px]`}></i>
                  </span>
                  <span className="text-[9px] font-bold text-[var(--text-muted)] group-hover:text-[var(--text-heading)] text-center leading-tight">
                    {opt.name}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Native share if available */}
          {(navigator as any).share && (
            <div className="pt-2">
              <button
                onClick={handleNativeShare}
                className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer bg-[var(--primary)]/10 border-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/15"
              >
                <i className="ph ph-share-network text-[16px]"></i>
                More options (System share)
              </button>
            </div>
          )}

          {/* QR hint? */}
          <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] flex items-start gap-2.5">
            <i className="ph ph-info text-[14px] text-[var(--primary)] mt-0.5"></i>
            <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
              Anyone with this link can view the documentation. The link preserves your current selection.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-end gap-2 shrink-0 border-[var(--border)] bg-[var(--background)]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg border hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-[var(--text-heading)] border-[var(--border)]"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] hover:opacity-90 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <i className={`ph ${copied ? 'ph-check' : 'ph-copy'}`}></i>
            {copied ? 'Copied Link' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}