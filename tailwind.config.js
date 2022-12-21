/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,jsx}'],
  theme: {
    extend: {
      aspectRatio: {
        card: ' 5 / 7',
        'tapped-card': ' 7 / 5',
      },
      padding: {
        '4px': '4px',
      },
    },
  },
  plugins: [],
};
