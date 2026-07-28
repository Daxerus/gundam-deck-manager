import { useEffect, useState } from 'react';

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 300);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center border border-hud/60 bg-void/90 text-hud shadow-hud backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-hud hover:bg-hud/10 hover:text-hud-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-label="Volver al inicio de la página"
      title="Volver arriba"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="m5 14 7-7 7 7" />
      </svg>
    </button>
  );
}
