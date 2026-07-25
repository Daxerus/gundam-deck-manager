/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cockpit HUD palette
        void: '#04080f',
        panel: '#0a1622',
        'panel-2': '#0e1e2e',
        hud: {
          DEFAULT: '#2fe4e8',
          dim: '#1a8f92',
          glow: '#5ff6fa',
        },
        amber: {
          DEFAULT: '#ffb020',
          dim: '#a8741a',
        },
        alert: {
          DEFAULT: '#ff4d5e',
          dim: '#a53340',
        },
        ok: {
          DEFAULT: '#35e08a',
          dim: '#1f8a55',
        },
        ink: '#d3eef2',
        muted: '#6f909b',
        line: '#1c3b4a',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        ui: ['Rajdhani', 'system-ui', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'ui-monospace', 'monospace'],
        body: ['system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        hud: '0 0 0 1px rgba(47,228,232,0.25), 0 0 18px -4px rgba(47,228,232,0.35)',
        'hud-strong': '0 0 0 1px rgba(47,228,232,0.5), 0 0 28px -2px rgba(47,228,232,0.55)',
        alert: '0 0 0 1px rgba(255,77,94,0.4), 0 0 18px -4px rgba(255,77,94,0.5)',
      },
      keyframes: {
        flicker: {
          '0%,100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.7' },
          '94%': { opacity: '1' },
          '97%': { opacity: '0.85' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        sweep: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'card-preview-in': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        flicker: 'flicker 6s infinite',
        blink: 'blink 1.4s ease-in-out infinite',
        sweep: 'sweep 5s linear infinite',
        'card-preview-in': 'card-preview-in 160ms ease-out',
      },
    },
  },
  plugins: [],
};
