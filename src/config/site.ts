// ===== SITE CONFIGURATION =====
// Update these values with your own details.

export const siteConfig = {
  name: 'Dror Trzewik',
  title: 'Dror Trzewik — Portfolio',
  description: 'Industrial designer working with functional empathy, playful aesthetics, and sustainable design principles.',
  url: 'https://drortrz.github.io',

  // Where the contact form posts. Leave empty and the form falls back to
  // composing a mailto: from the field values, so messages are never lost.
  // To collect submissions instead, paste a Formspree-style endpoint here,
  // e.g. 'https://formspree.io/f/xxxxxxxx'.
  contactEndpoint: '',
  contactEmail: 'drortrz@gmail.com',

  // Absolute so the anchors also work from /projects/…
  nav: [
    { label: 'Work', href: '/#work' },
    { label: 'About', href: '/#about' },
    { label: 'Contact', href: '/#contact' },
  ],

  // Social links (add or remove as needed)
  // TODO: add your LinkedIn / Instagram handles here when you want them public.
  social: [
    { label: 'Email', href: 'mailto:drortrz@gmail.com' },
    { label: 'Portfolio', href: 'https://cheid.myportfolio.com' },
  ],
};
