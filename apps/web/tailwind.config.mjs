/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          200: '#bcdeff',
          300: '#8ecbff',
          400: '#59afff',
          500: '#338fff',
          600: '#1c70f5',
          700: '#1758e1',
          800: '#1949b6',
          900: '#1a408f',
        },
      },
    },
  },
  plugins: [],
};
