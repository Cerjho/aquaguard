/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aquaguard: {
          primary: '#0369a1',
          danger: '#dc2626',
          success: '#16a34a',
          warning: '#d97706',
        },
      },
    },
  },
  plugins: [],
};
