/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        // Add custom animations for the fade-in effect
        keyframes: {
            'fade-in': {
                '0%': { opacity: '0' },
                '100%': { opacity: '1' },
            },
            'slide-in-from-bottom-4': {
                '0%': { transform: 'translateY(1rem)', opacity: '0' },
                '100%': { transform: 'translateY(0)', opacity: '1' },
            }
        },
        animation: {
            'in': 'fade-in 0.5s ease-out',
            'in-from-bottom-4': 'slide-in-from-bottom-4 0.5s ease-out, fade-in 0.5s ease-out'
        }
    },
  },
  plugins: [
    function({ addVariant }) {
        addVariant('animate-in', '&.animate-in')
    }
  ],
}