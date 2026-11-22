import { SiteContentData } from '../types';

export const WEDDING_PHOTOS = {
  hero: {
    src: '/images/wedding/hero-couple.jpg',
    alt: 'Mary and Joseph in traditional wedding celebration attire'
  },
  story: {
    src: '/images/wedding/story-couple.jpg',
    alt: 'Mary and Joseph smiling together outdoors'
  },
  schedule: {
    src: '/images/wedding/schedule-venue.jpg',
    alt: 'Mary and Joseph outside Ivana Events and Amusement Center'
  },
  qa: {
    src: '/images/wedding/qa-couple.jpg',
    alt: 'Formal portrait of Mary and Joseph'
  }
};

export const AUTHORITATIVE_GALLERY_LOCK_MESSAGE =
  'Help us relive our special day through your eyes. Our guest photo gallery will open on 12 December 2026. Come back on the wedding day to share your favourite moments with us!';

export const AUTHORITATIVE_QA_INTRO =
  "If you've got any questions, have a look at our Q & A section first!";

export const DEFAULT_SITE_CONTENT: SiteContentData = {
  coupleNames: 'Mary & Joseph',
  brideName: 'Mary',
  groomName: 'Joseph',
  hashtag: '#mjay2026',
  weddingDateDisplay: 'Saturday, 12 December 2026',
  ceremonyTargetISO: '2026-12-12T10:00:00+01:00',
  galleryUnlockISO: '2026-12-12T00:00:00+01:00',
  galleryUnlockEpochMs: 1797030000000,
  mainVenue: 'Ivana Events and Amusement Center, Abuja-Keffi Road, Abuja, Nigeria, Nasarawa',
  heroImageUrl: WEDDING_PHOTOS.hero.src,
  contactName: 'Victoria',
  contactPhone: '+2348031234567',
  welcomeHeading: 'Welcome to Our Love Story',
  welcomeParagraphs: [
    "Every great love story is made even more beautiful by the people who share in it, and we are incredibly grateful that you're here to celebrate ours.",
    "As we begin this new chapter together, our hearts are filled with joy knowing we'll be surrounded by the love, laughter, and blessings of our family and friends.",
    'Thank you for being part of our journey and for making our happiest day even more unforgettable.'
  ],
  welcomeSignOff: 'With all our love,\nThe Bride & Groom',
  storyHeading: 'Our Story',
  storyParagraphs: [
    'They say love finds you when you least expect it—and for us, it began in the most unexpected place: a fashion house in Abuja.',
    'What started as a simple meeting soon turned into effortless conversations, shared laughter, and a friendship that neither of us saw coming. With every visit, every conversation, and every moment spent together, we discovered that the best things in life are often beautifully unplanned.',
    'Somewhere between fabrics, fittings, and dreams being stitched together, God was quietly weaving our own love story. What began as strangers crossing paths became two hearts finding home in each other.',
    "Today, we're grateful for that unexpected beginning and even more excited for the beautiful forever that lies ahead."
  ],
  coupleQas: [
    {
      id: 'cqa-1',
      question: 'How did you two meet?',
      answer: 'See Our Story!'
    },
    {
      id: 'cqa-2',
      question: 'Who made the first move?',
      answer: 'You guessed right - him!. He is a sharpshooter who knows what he want.'
    },
    {
      id: 'cqa-3',
      question: 'Who said "I love you" first?',
      answer: 'I did all the right things that triggered "I love you" from her. 💞😋'
    },
    {
      id: 'cqa-4',
      question: 'Who takes out the rubbish?',
      answer: "Whoever's nearest the bin :)"
    },
    {
      id: 'cqa-5',
      question: 'Who is more likely to cry during the wedding?',
      answer: 'Her siblings. They will miss her so much. 😎'
    },
    {
      id: 'cqa-6',
      question: 'If you could relive one day together, which would it be?',
      answer: 'One particular Ice Cream date 🤐'
    },
    {
      id: 'cqa-7',
      question: 'What are you most looking forward to after the wedding?',
      answer: 'Counting the money we get as gifts 🤣😋'
    }
  ],
  scheduleEvents: [
    {
      id: 'evt-traditional',
      dayKey: 'dec-11',
      dayHeading: 'FRIDAY, 11 DECEMBER 2026',
      dateISO: '2026-12-11',
      startTime24: '14:30',
      timeLabel: '14:30',
      title: 'Traditional Wedding / Engagement',
      venueName: 'City College Rd, Ado, Nigeria',
      venueQuery: 'City College Rd, Ado, Nigeria',
      dressCode: 'Traditional Attire',
      coloursOfDay: 'White, Burnt Orange, and Emerald Green.',
      description: 'We would love to have you at our Traditional Wedding and Engagement Party.'
    },
    {
      id: 'evt-church',
      dayKey: 'dec-12',
      dayHeading: 'SATURDAY, 12 DECEMBER 2026',
      dateISO: '2026-12-12',
      startTime24: '10:00',
      endTime24: '12:00',
      timeLabel: '10:00 to 12:00',
      title: '⛪ Join Us at the Altar - Church Wedding!',
      venueName: 'Alafia Oluwa Baptist Church, along Karu market, 2J2Q+PCG, junction, Ado 961105, Nasarawa, Nigeria',
      venueQuery: 'Alafia Oluwa Baptist Church, along Karu market, 2J2Q+PCG, junction, Ado 961105, Nasarawa, Nigeria',
      description:
        "We'd be honored to have you witness the moment we exchange our vows and become one before God. Your presence, prayers, and blessings will make this sacred occasion even more meaningful."
    },
    {
      id: 'evt-reception',
      dayKey: 'dec-12',
      dayHeading: 'SATURDAY, 12 DECEMBER 2026',
      dateISO: '2026-12-12',
      startTime24: '13:00',
      timeLabel: '13:00',
      title: '🥂 Celebrate With Us - The Reception!',
      venueName: 'Ivana Events and Amusement Center',
      venueQuery: 'Ivana Events and Amusement Center, Abuja-Keffi Road, Abuja, Nigeria, Nasarawa',
      dressCode: 'Elegant Style',
      description:
        'After we say "I do," the celebration begins!\n\nJoin us for an unforgettable evening of love, laughter, music, delicious food, and joyful dancing as we celebrate the start of our forever.'
    }
  ],
  guestFaqs: [
    {
      id: 'faq-1',
      question: 'What time should I arrive?',
      answer:
        'We recommend arriving 10–20 minutes before the ceremony to allow enough time for seating before the service begins because we intend to keep to time.'
    },
    {
      id: 'faq-2',
      question: 'Will food and drinks be served?',
      answer: 'Absolutely! Come hungry and ready to enjoy a delicious meal, refreshing drinks, and plenty of cake!'
    },
    {
      id: 'faq-3',
      question: 'Is there a dress code?',
      answer: 'Come dressed to celebrate!\n\nOur colors are White, Burnt Orange, and Emerald Green.'
    },
    {
      id: 'faq-4',
      question: 'Can I take photos during the ceremony?',
      answer:
        'Feel free to capture moments before and after the ceremony. During the vows, we kindly ask that you allow our professional photographers to do their work so everyone can enjoy the moment.'
    },
    {
      id: 'faq-5',
      question: "What if I can't make it?",
      answer: "We'll miss celebrating with you, but we completely understand. Thanks for sending your gifts in advance 🥰"
    },
    {
      id: 'faq-6',
      question: 'Will the ceremony and reception be at the same venue?',
      answer:
        'No. The church ceremony and reception will take place at different venues. Please check the Schedule section for addresses and directions.'
    },
    {
      id: 'faq-7',
      question: 'How can I share the photos I take?',
      answer:
        "We'd love to see the day through your eyes! Please upload your photos and videos using the Gallery section on this website."
    },
    {
      id: 'faq-8',
      question: 'Who should I get in touch with if I have questions?',
      answer:
        "If you've got any questions, just get in touch with our lovely Maid of Honour, Victoria, on +2348031234567."
    }
  ],
  footerNote: 'Celebrating Mary & Joseph in Abuja, Nigeria',
  rsvpOpen: true,
  maxGuestsPerRsvp: 1,
  galleryPublicEnabled: true,
  themePrimaryHex: '#07543E',
  themeAccentHex: '#737746',
  themeGoldHex: '#C5A04A',
  puzzleEnabled: true,
  puzzleImageFileId: '',
  puzzleImageUrl: WEDDING_PHOTOS.story.src,
  musicEnabled: true,
  musicTitle: 'Perfect',
  musicArtist: 'Ed Sheeran',
  musicAudioFileId: '',
  musicAudioUrl: '',
  musicAudioFileName: '',
  giftingEnabled: true,
  giftingHeading: 'Gifting & Support',
  giftingIntro:
    'Your presence is the greatest gift. If you would still love to bless our new beginning, you may use the details below. Thank you for your love and generosity.',
  giftingClosing: 'Thank you for celebrating with us.',
  giftingAccountName: 'Joseph John',
  giftingBankName: 'Opay',
  giftingAccountNumber: '8065013009',
  sectionTypography: {},
  slideshowAutoplay: true,
  slideshowIntervalMs: 5000,
  slideshowItems: [
    {
      id: 'slide-hero',
      title: 'Mary & Joseph',
      caption: 'Celebrating our love story in Abuja',
      fileUrl: WEDDING_PHOTOS.hero.src,
      driveFileId: '',
      storageProvider: 'site_asset',
      enabled: true,
      order: 0
    },
    {
      id: 'slide-story',
      title: 'Our Journey Together',
      caption: 'Where two hearts found home in each other',
      fileUrl: WEDDING_PHOTOS.story.src,
      driveFileId: '',
      storageProvider: 'site_asset',
      enabled: true,
      order: 1
    },
    {
      id: 'slide-schedule',
      title: 'December 2026',
      caption: 'Ivana Events and Amusement Center, Abuja',
      fileUrl: WEDDING_PHOTOS.schedule.src,
      driveFileId: '',
      storageProvider: 'site_asset',
      enabled: true,
      order: 2
    },
    {
      id: 'slide-qa',
      title: 'Forever Begins',
      caption: 'Saturday, 12 December 2026 · #mjay2026',
      fileUrl: WEDDING_PHOTOS.qa.src,
      driveFileId: '',
      storageProvider: 'site_asset',
      enabled: true,
      order: 3
    }
  ]
};
