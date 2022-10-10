/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx}'],
  theme: {
    extend: {
      aspectRatio: {
        card: ' 5 / 7',
      },
    },
  },
  plugins: [],
};
