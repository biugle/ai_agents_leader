import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { WindowControls } from './WindowControls.js';

interface FloatingGroupProps {
  children: ReactNode;
  isDesktopShell?: boolean;
  webMaxViewportRatio?: number;
  onPreferredHeightChange?: (height: number) => void;
}

const DESKTOP_MAX_VISIBLE_CARDS = 7;

/**
 * Container for the floating overlay.
 * Glass background, rounded corners, window controls.
 * Only the top bar is draggable in Tauri so the card list can scroll normally.
 */
export function FloatingGroup({
  children,
  isDesktopShell = false,
  webMaxViewportRatio = 0.99,
  onPreferredHeightChange,
}: FloatingGroupProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const maxHeight = isDesktopShell
    ? '100%'
    : `${Math.round(webMaxViewportRatio * 100)}dvh`;
  const scrollRegionClassName = 'aal-scroll-region';

  useEffect(() => {
    if (!isDesktopShell || !onPreferredHeightChange) {
      return;
    }

    const container = containerRef.current;
    const header = headerRef.current;
    const scrollRegion = scrollRegionRef.current;
    const content = contentRef.current;
    if (!container || !header || !scrollRegion || !content) {
      return;
    }

    let frameId = 0;
    const childResizeObserver = new ResizeObserver(() => {
      reportPreferredHeight();
    });

    const reportPreferredHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const containerStyle = window.getComputedStyle(container);
        const scrollRegionStyle = window.getComputedStyle(scrollRegion);
        const paddingTop = Number.parseFloat(containerStyle.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(containerStyle.paddingBottom) || 0;
        const gap = Number.parseFloat(containerStyle.rowGap || containerStyle.gap) || 0;
        const scrollPaddingTop = Number.parseFloat(scrollRegionStyle.paddingTop) || 0;
        const scrollPaddingBottom = Number.parseFloat(scrollRegionStyle.paddingBottom) || 0;
        const contentGap = Number.parseFloat(window.getComputedStyle(content).rowGap || window.getComputedStyle(content).gap) || 0;
        const cards = Array.from(content.children).filter(
          (child): child is HTMLElement => child instanceof HTMLElement,
        );
        const visibleCards = cards.slice(0, DESKTOP_MAX_VISIBLE_CARDS);
        const visibleContentHeight = visibleCards.reduce((total, card, index) => {
          return total + card.getBoundingClientRect().height + (index > 0 ? contentGap : 0);
        }, 0);
        const minContentHeight = cards[0]?.getBoundingClientRect().height ?? content.scrollHeight;
        const clampedContentHeight = Math.max(
          minContentHeight,
          Math.min(content.scrollHeight, visibleContentHeight || content.scrollHeight),
        );
        const preferredHeight = Math.ceil(
          paddingTop + paddingBottom + gap + header.offsetHeight + scrollPaddingTop + scrollPaddingBottom + clampedContentHeight,
        );

        onPreferredHeightChange(preferredHeight);
      });
    };

    const observeCardHeights = () => {
      childResizeObserver.disconnect();
      for (const child of Array.from(content.children)) {
        if (child instanceof HTMLElement) {
          childResizeObserver.observe(child);
        }
      }
    };

    const observer = new ResizeObserver(() => {
      reportPreferredHeight();
    });

    const mutationObserver = new MutationObserver(() => {
      observeCardHeights();
      reportPreferredHeight();
    });

    observer.observe(container);
    observer.observe(header);
    observer.observe(scrollRegion);
    observer.observe(content);
    observeCardHeights();
    mutationObserver.observe(scrollRegion, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    reportPreferredHeight();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      childResizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [isDesktopShell, onPreferredHeightChange, children]);

  return (
    <div
      ref={containerRef}
      style={{
        background: 'var(--aal-bg)',
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        minWidth: 0,
        maxHeight,
        height: isDesktopShell ? '100%' : 'auto',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={headerRef}
        data-tauri-drag-region={isDesktopShell ? 'true' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          minHeight: 28,
          paddingBottom: 6,
          cursor: isDesktopShell ? 'grab' : 'default',
          flexShrink: 0,
        }}
      >
        <WindowControls />
      </div>
      <div
        ref={scrollRegionRef}
        className={scrollRegionClassName}
        data-tauri-drag-region="false"
        onWheelCapture={(event) => {
          if (!isDesktopShell) {
            return;
          }

          const target = event.currentTarget;
          const canScroll = target.scrollHeight > target.clientHeight;
          if (!canScroll) {
            return;
          }

          target.scrollTop += event.deltaY;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          minWidth: 0,
          padding: '4px 8px 8px 4px',
          scrollbarGutter: 'stable',
        }}
      >
        <div
          ref={contentRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
