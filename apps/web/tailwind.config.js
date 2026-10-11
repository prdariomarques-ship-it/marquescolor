/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        azul: '#1E63B8',
        amarelo: '#F2B705',
        vermelho: '#D93636',
        verde: '#2E9E5B',
        laranja: '#F27405',
        fundo: '#f7f8fa',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
