/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paypal: {
          dark: '#001C64',
          deep: '#003087',
          blue: '#0070BA',
          light: '#00CFDE',
          subtle: '#EBF4FC',
        },
      },
    },
  },
  plugins: [],
}

