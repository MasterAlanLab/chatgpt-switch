import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { menuPosition } from '../../lib/menu-position';

interface Props {
  accountName: string;
  anchor: HTMLButtonElement;
  onClose: () => void;
  onSelect: (action: 'rename' | 'delete') => void;
}

export default function AccountMenu({ accountName, anchor, onClose, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [position, setPosition] = useState<{ top: number; left: number }>();

  useLayoutEffect(() => {
    const menu = ref.current!;
    let anchorRect = anchor.getBoundingClientRect();
    const update = () => {
      anchorRect = anchor.getBoundingClientRect();
      setPosition(
        menuPosition(anchorRect, menu.getBoundingClientRect(), {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };
    update();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.contains(target) && !anchor.contains(target)) onClose();
    };
    const scroll = (event: Event) => {
      if (menu.contains(event.target as Node)) return;
      const next = anchor.getBoundingClientRect();
      // Ignore queued scroll events from bringing the trigger into view before
      // opening. Dismiss only when the already-positioned anchor actually moves.
      if (
        !anchor.isConnected ||
        Math.abs(next.top - anchorRect.top) > 0.5 ||
        Math.abs(next.left - anchorRect.left) > 0.5
      )
        onClose();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    if (!position || focused.current) return;
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    focused.current = true;
  }, [position]);

  const select = (action: 'rename' | 'delete') => {
    // The dialog will restore focus to the original trigger instead of a removed menu item.
    anchor.focus({ preventScroll: true });
    onSelect(action);
  };

  return createPortal(
    <div
      ref={ref}
      id="account-actions-menu"
      className="menu-popover"
      role="menu"
      aria-label={`管理 ${accountName}`}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={(event) => {
        const buttons = [...ref.current!.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus({ preventScroll: true });
        } else if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          anchor.focus({ preventScroll: true });
          onClose();
        }
      }}
    >
      <button role="menuitem" onClick={() => select('rename')}>
        <Pencil size={14} />
        编辑备注
      </button>
      <button role="menuitem" className="danger" onClick={() => select('delete')}>
        <Trash2 size={14} />
        移除账号
      </button>
    </div>,
    document.body,
  );
}
