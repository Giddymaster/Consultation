/**
 * Seed content for Meridian Advisory — a fictional East African strategy and
 * advisory firm. The copy is written as a real firm would write it so the
 * seeded database is usable for demos, screenshots and manual QA without
 * anything reading as placeholder text.
 */

export const SERVICE_CATEGORIES = [
  {
    slug: 'strategy',
    name: 'Strategy & Growth',
    description: 'Positioning, market entry and growth planning for organisations at an inflection point.',
    icon: 'Target',
    sortOrder: 1,
  },
  {
    slug: 'finance',
    name: 'Finance & Capital',
    description: 'Financial modelling, fundraising readiness and capital structure advice.',
    icon: 'Wallet',
    sortOrder: 2,
  },
  {
    slug: 'operations',
    name: 'Operations & Delivery',
    description: 'Process design, delivery capability and operating model reviews.',
    icon: 'Settings',
    sortOrder: 3,
  },
  {
    slug: 'people',
    name: 'People & Leadership',
    description: 'Executive coaching, organisation design and leadership development.',
    icon: 'Users',
    sortOrder: 4,
  },
  {
    slug: 'technology',
    name: 'Technology & Data',
    description: 'Digital strategy, data governance and technology due diligence.',
    icon: 'Cpu',
    sortOrder: 5,
  },
  {
    slug: 'governance',
    name: 'Risk & Governance',
    description: 'Board effectiveness, compliance posture and enterprise risk.',
    icon: 'Shield',
    sortOrder: 6,
  },
] as const;

export interface SeedConsultant {
  email: string;
  firstName: string;
  lastName: string;
  slug: string;
  title: string;
  biography: string;
  specialties: string[];
  qualifications: string[];
  languages: string[];
  yearsExperience: number;
  linkedinUrl: string;
  timezone: string;
  slotIntervalMinutes: number;
  /** Weekday (0=Sun) → [start, end] wall-clock in the consultant's timezone. */
  workingHours: Record<number, [string, string][]>;
}

export const CONSULTANTS: SeedConsultant[] = [
  {
    email: 'a.mwangi@meridianadvisory.co.ke',
    firstName: 'Achieng',
    lastName: 'Mwangi',
    slug: 'achieng-mwangi',
    title: 'Managing Partner, Strategy',
    biography:
      'Achieng leads Meridian’s strategy practice. Over eighteen years she has advised banks, agri-processors and regional retailers through market entry, turnaround and post-merger integration. She spent six years at a global strategy house in Johannesburg and Nairobi before co-founding Meridian, and now works mainly with founder-led businesses crossing the threshold from owner-run to professionally managed.\n\nHer approach is deliberately unglamorous: get the numbers honest, name the two or three decisions that actually matter, and build the operating discipline to follow through.',
    specialties: ['Market entry', 'Growth strategy', 'Post-merger integration', 'Pricing'],
    qualifications: ['MBA, INSEAD', 'BCom (Hons), University of Cape Town', 'Certified Management Consultant'],
    languages: ['English', 'Kiswahili'],
    yearsExperience: 18,
    linkedinUrl: 'https://www.linkedin.com/in/achieng-mwangi-meridian',
    timezone: 'Africa/Nairobi',
    slotIntervalMinutes: 30,
    workingHours: {
      1: [['09:00', '12:30'], ['14:00', '17:00']],
      2: [['09:00', '12:30'], ['14:00', '17:00']],
      3: [['09:00', '13:00']],
      4: [['09:00', '12:30'], ['14:00', '17:00']],
      5: [['09:00', '13:00']],
    },
  },
  {
    email: 'd.otieno@meridianadvisory.co.ke',
    firstName: 'David',
    lastName: 'Otieno',
    slug: 'david-otieno',
    title: 'Partner, Finance & Capital',
    biography:
      'David advises companies raising between USD 1m and USD 30m. He has sat on both sides of the table — seven years in corporate finance at a regional investment bank, then four as an investment director at a development finance fund — and is candid about what actually gets a deal over the line.\n\nHe works with management teams on financial models that survive due diligence, capital structures that do not constrain the next round, and the unglamorous reporting discipline that keeps investors calm between board meetings.',
    specialties: ['Fundraising readiness', 'Financial modelling', 'Valuation', 'Investor reporting'],
    qualifications: ['CFA Charterholder', 'BSc Economics, London School of Economics', 'ACCA'],
    languages: ['English', 'Kiswahili', 'French'],
    yearsExperience: 14,
    linkedinUrl: 'https://www.linkedin.com/in/david-otieno-cf',
    timezone: 'Africa/Nairobi',
    slotIntervalMinutes: 30,
    workingHours: {
      1: [['08:30', '12:00'], ['13:30', '17:30']],
      2: [['08:30', '12:00'], ['13:30', '17:30']],
      3: [['08:30', '12:00'], ['13:30', '17:30']],
      4: [['08:30', '12:00']],
      5: [['08:30', '12:00'], ['13:30', '16:00']],
    },
  },
  {
    email: 'p.wanjiru@meridianadvisory.co.ke',
    firstName: 'Priya',
    lastName: 'Wanjiru',
    slug: 'priya-wanjiru',
    title: 'Director, Operations',
    biography:
      'Priya rebuilds operations that have outgrown the way they were first set up. Her background is in manufacturing and logistics — nine years running plant operations for an FMCG group across three countries — and she brings a practitioner’s scepticism to process redesign.\n\nMost of her engagements start with a week of watching how work actually flows, which almost always contradicts the process map. She specialises in service delivery organisations, distribution networks and shared-service centres.',
    specialties: ['Operating model design', 'Process improvement', 'Supply chain', 'Service delivery'],
    qualifications: ['MSc Industrial Engineering, University of Nairobi', 'Lean Six Sigma Black Belt', 'CIPS Level 6'],
    languages: ['English', 'Kiswahili', 'Hindi'],
    yearsExperience: 12,
    linkedinUrl: 'https://www.linkedin.com/in/priya-wanjiru-ops',
    timezone: 'Africa/Nairobi',
    slotIntervalMinutes: 30,
    workingHours: {
      1: [['09:00', '13:00'], ['14:00', '18:00']],
      2: [['09:00', '13:00'], ['14:00', '18:00']],
      3: [['09:00', '13:00'], ['14:00', '18:00']],
      4: [['09:00', '13:00'], ['14:00', '18:00']],
      5: [['09:00', '12:00']],
    },
  },
  {
    email: 's.kimani@meridianadvisory.co.ke',
    firstName: 'Samuel',
    lastName: 'Kimani',
    slug: 'samuel-kimani',
    title: 'Principal, Technology & Data',
    biography:
      'Samuel advises boards and executive teams on technology decisions they cannot easily reverse: core system replacement, data platform strategy, build-versus-buy, and technical due diligence ahead of an acquisition.\n\nHe was previously CTO of a regional payments business and has led two core banking migrations. He is unusually direct about the cost of technical debt and equally direct that most organisations need less technology than they are being sold.',
    specialties: ['Technology due diligence', 'Data governance', 'Digital strategy', 'Systems selection'],
    qualifications: ['MSc Computer Science, University of Edinburgh', 'TOGAF 10 Certified', 'CISM'],
    languages: ['English', 'Kiswahili'],
    yearsExperience: 16,
    linkedinUrl: 'https://www.linkedin.com/in/samuel-kimani-tech',
    timezone: 'Africa/Nairobi',
    slotIntervalMinutes: 30,
    workingHours: {
      1: [['10:00', '13:00'], ['14:00', '18:00']],
      2: [['10:00', '13:00'], ['14:00', '18:00']],
      3: [['10:00', '13:00'], ['14:00', '18:00']],
      4: [['10:00', '13:00'], ['14:00', '18:00']],
      5: [['10:00', '14:00']],
    },
  },
  {
    email: 'n.abdi@meridianadvisory.co.ke',
    firstName: 'Nasra',
    lastName: 'Abdi',
    slug: 'nasra-abdi',
    title: 'Director, People & Governance',
    biography:
      'Nasra works with executive teams and boards on the human side of performance: organisation design, succession, board effectiveness and the difficult conversations that get deferred.\n\nShe is an accredited executive coach with a prior career in human resources leadership across financial services and telecommunications. She chairs the remuneration committee of a listed company, which informs a practical view of what boards will and will not accept.',
    specialties: ['Executive coaching', 'Board effectiveness', 'Organisation design', 'Succession planning'],
    qualifications: [
      'MSc Organisational Psychology, Birkbeck',
      'ICF Professional Certified Coach (PCC)',
      'Member, Institute of Directors',
    ],
    languages: ['English', 'Kiswahili', 'Somali', 'Arabic'],
    yearsExperience: 15,
    linkedinUrl: 'https://www.linkedin.com/in/nasra-abdi-people',
    timezone: 'Africa/Nairobi',
    slotIntervalMinutes: 60,
    workingHours: {
      1: [['09:00', '12:00'], ['14:00', '17:00']],
      2: [['09:00', '12:00'], ['14:00', '17:00']],
      3: [['14:00', '18:00']],
      4: [['09:00', '12:00'], ['14:00', '17:00']],
      5: [['09:00', '12:00']],
    },
  },
];

export interface SeedService {
  slug: string;
  name: string;
  categorySlug: string;
  shortDescription: string;
  fullDescription: string;
  durations: { minutes: number; price: number; label?: string; isDefault?: boolean }[];
  paymentModel: 'FULL_PAYMENT' | 'FIXED_DEPOSIT' | 'PERCENTAGE_DEPOSIT' | 'FREE';
  depositAmount?: number;
  depositPercentBps?: number;
  taxRateBps: number;
  meetingProviders: ('ZOOM' | 'GOOGLE_MEET' | 'MICROSOFT_TEAMS' | 'IN_PERSON' | 'PHONE')[];
  preparationNotes: string;
  cancellationPolicy: string;
  reschedulePolicy: string;
  leadTimeHours: number;
  isFeatured: boolean;
  icon: string;
  consultantSlugs: string[];
}

/** Prices are in KES cents. KES 2,500.00 → 250000. */
export const SERVICES: SeedService[] = [
  {
    slug: 'business-strategy-consultation',
    name: 'Business Strategy Consultation',
    categorySlug: 'strategy',
    shortDescription:
      'A focused working session on the one strategic decision in front of you — market, product, pricing or positioning.',
    fullDescription:
      'This is a working session, not a presentation. You bring the decision you are stuck on; we spend the time pressure-testing the reasoning, naming the assumptions that carry the most risk, and agreeing what evidence would change your mind.\n\nMost clients use this format for a specific question: whether to enter a new county or country, how to price a new line, whether an acquisition target makes sense, or how to respond to a competitor’s move. You will leave with a written summary of the discussion, the recommendations we reached, and a short list of actions with owners.\n\nIf the question turns out to be larger than a single session, we will say so plainly and set out what a fuller engagement would involve — with no obligation.',
    durations: [
      { minutes: 30, price: 250000, label: 'Focused question', isDefault: true },
      { minutes: 60, price: 450000, label: 'Full session' },
      { minutes: 90, price: 620000, label: 'Extended working session' },
    ],
    paymentModel: 'FIXED_DEPOSIT',
    depositAmount: 50000,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'IN_PERSON'],
    preparationNotes:
      'Send any relevant numbers 24 hours ahead — a P&L, a pricing sheet, a one-page description of the decision. We will have read them before we meet.',
    cancellationPolicy:
      'Cancel free of charge up to 24 hours before the session. Inside 24 hours the deposit is retained; the balance is not charged.',
    reschedulePolicy: 'Reschedule once at no cost up to 24 hours before the session.',
    leadTimeHours: 24,
    isFeatured: true,
    icon: 'Target',
    consultantSlugs: ['achieng-mwangi', 'david-otieno'],
  },
  {
    slug: 'fundraising-readiness-review',
    name: 'Fundraising Readiness Review',
    categorySlug: 'finance',
    shortDescription:
      'An investor-side read on your materials before you go to market — model, deck, data room and the questions you will be asked.',
    fullDescription:
      'Before you approach investors, it is worth knowing how your materials will look from the other side of the table. In this review we go through your financial model, pitch deck and data room the way an investment committee would, and tell you where it will snag.\n\nWe cover the model’s internal consistency and the defensibility of its assumptions, the equity story and whether the deck actually tells it, the gaps in your data room that will slow diligence, and the three or four questions you should expect to be pressed hardest on.\n\nThis is most useful four to eight weeks before you plan to start conversations, while there is still time to act on what we find.',
    durations: [
      { minutes: 60, price: 750000, label: 'Standard review', isDefault: true },
      { minutes: 120, price: 1350000, label: 'Deep review with model walkthrough' },
    ],
    paymentModel: 'PERCENTAGE_DEPOSIT',
    depositPercentBps: 3000,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'MICROSOFT_TEAMS'],
    preparationNotes:
      'Share your model, deck and data room index at least 48 hours ahead. We review them before the session so the time is spent on findings, not orientation.',
    cancellationPolicy:
      'Cancel up to 48 hours before for a full refund. Inside 48 hours the deposit is retained, as preparation work will already have begun.',
    reschedulePolicy: 'Reschedule up to 48 hours before at no cost.',
    leadTimeHours: 72,
    isFeatured: true,
    icon: 'TrendingUp',
    consultantSlugs: ['david-otieno', 'achieng-mwangi'],
  },
  {
    slug: 'operating-model-review',
    name: 'Operating Model Review',
    categorySlug: 'operations',
    shortDescription:
      'Where the work actually gets stuck — a structured diagnostic of how your organisation delivers.',
    fullDescription:
      'Organisations rarely fail because of strategy alone; more often the operating model has quietly stopped matching the business. This session works through how decisions get made, where handoffs break down, which roles are carrying more than they should, and what your delivery data is telling you.\n\nWe will map the current state honestly, identify the two or three structural constraints that explain most of the friction, and set out a sequence for addressing them that does not require stopping the business to do it.\n\nSuitable for organisations between roughly 20 and 500 people, or for a specific function inside a larger group.',
    durations: [
      { minutes: 60, price: 550000, isDefault: true },
      { minutes: 120, price: 980000, label: 'Extended with team session' },
    ],
    paymentModel: 'FIXED_DEPOSIT',
    depositAmount: 150000,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'GOOGLE_MEET', 'IN_PERSON'],
    preparationNotes:
      'An org chart and any delivery or throughput data you have. If you have run a staff survey in the last year, send the results.',
    cancellationPolicy: 'Cancel free of charge up to 24 hours before. Inside 24 hours the deposit is retained.',
    reschedulePolicy: 'Reschedule up to 24 hours before at no cost.',
    leadTimeHours: 48,
    isFeatured: true,
    icon: 'Workflow',
    consultantSlugs: ['priya-wanjiru', 'achieng-mwangi'],
  },
  {
    slug: 'executive-coaching-session',
    name: 'Executive Coaching Session',
    categorySlug: 'people',
    shortDescription: 'Confidential one-to-one coaching for senior leaders, in a series or as a single session.',
    fullDescription:
      'Confidential, structured coaching for chief executives, functional leaders and those stepping into a materially bigger role. Sessions are led by an ICF-accredited coach and follow your agenda, not a curriculum.\n\nCommon themes: leading a team that used to be your peers, the transition from doing to directing, board and shareholder relationships, difficult performance conversations, and deciding what to stop doing.\n\nEverything discussed stays between you and your coach. Where an organisation is sponsoring the coaching, only attendance and agreed development themes are shared — never session content.',
    durations: [
      { minutes: 60, price: 480000, isDefault: true },
      { minutes: 90, price: 680000, label: 'Extended session' },
    ],
    paymentModel: 'FULL_PAYMENT',
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'MICROSOFT_TEAMS', 'PHONE', 'IN_PERSON'],
    preparationNotes:
      'Come with one situation you are actively working through. No documents needed. Choose somewhere you can speak freely.',
    cancellationPolicy:
      'Cancel or reschedule free of charge up to 24 hours before. Inside 24 hours the session is charged in full, as the time is held exclusively for you.',
    reschedulePolicy: 'Reschedule up to 24 hours before at no cost.',
    leadTimeHours: 24,
    isFeatured: false,
    icon: 'UserCheck',
    consultantSlugs: ['nasra-abdi'],
  },
  {
    slug: 'technology-due-diligence',
    name: 'Technology Due Diligence',
    categorySlug: 'technology',
    shortDescription:
      'An independent technical read on an acquisition target, a platform decision or your own estate.',
    fullDescription:
      'An independent assessment of a technology estate — most often a target you are considering acquiring, occasionally your own before a raise.\n\nWe look at architecture and its fitness for the plan, the real state of technical debt, security and data protection posture, key-person dependency in the engineering team, licensing and third-party exposure, and what the next eighteen months of investment realistically costs.\n\nYou receive a written assessment with findings graded by materiality, and a session to walk through them. Where we cannot reach a confident view without access we did not have, we say so rather than guess.',
    durations: [
      { minutes: 90, price: 1250000, isDefault: true },
      { minutes: 180, price: 2200000, label: 'Full-day assessment' },
    ],
    paymentModel: 'PERCENTAGE_DEPOSIT',
    depositPercentBps: 4000,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'MICROSOFT_TEAMS'],
    preparationNotes:
      'Architecture documentation, repository access where possible, the current infrastructure bill, and any prior security assessments.',
    cancellationPolicy: 'Cancel up to 72 hours before for a full refund. Inside 72 hours the deposit is retained.',
    reschedulePolicy: 'Reschedule up to 72 hours before at no cost.',
    leadTimeHours: 96,
    isFeatured: true,
    icon: 'ServerCog',
    consultantSlugs: ['samuel-kimani'],
  },
  {
    slug: 'board-effectiveness-review',
    name: 'Board Effectiveness Review',
    categorySlug: 'governance',
    shortDescription:
      'A structured review of how your board works — composition, information, dynamics and decision quality.',
    fullDescription:
      'Boards are frequently assessed on process compliance and rarely on whether they are actually improving decisions. This review looks at both.\n\nWe examine composition against the strategy the board is overseeing, the quality and timing of the information it receives, how meeting time is allocated between assurance and direction, committee effectiveness, and the dynamics that determine whether dissent is genuinely welcome.\n\nDelivered as a confidential review with a written report to the chair, and, where the board wishes, a facilitated session to work through the findings together.',
    durations: [
      { minutes: 90, price: 950000, isDefault: true },
      { minutes: 150, price: 1500000, label: 'Review plus facilitated board session' },
    ],
    paymentModel: 'FIXED_DEPOSIT',
    depositAmount: 250000,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'MICROSOFT_TEAMS', 'IN_PERSON'],
    preparationNotes:
      'Board papers from the last three meetings, the current board charter and committee terms of reference, and the skills matrix if one exists.',
    cancellationPolicy: 'Cancel up to 48 hours before for a full refund. Inside 48 hours the deposit is retained.',
    reschedulePolicy: 'Reschedule up to 48 hours before at no cost.',
    leadTimeHours: 72,
    isFeatured: false,
    icon: 'Landmark',
    consultantSlugs: ['nasra-abdi', 'achieng-mwangi'],
  },
  {
    slug: 'financial-model-build',
    name: 'Financial Model Review & Build',
    categorySlug: 'finance',
    shortDescription:
      'Build a model that holds up, or have your existing one stress-tested line by line.',
    fullDescription:
      'A working session on your financial model. Either we build the structure with you, or we take your existing model apart and put it back together.\n\nWe cover driver logic and whether it reflects how the business actually earns, the integrity of the three statements, scenario and sensitivity design, working capital treatment, and the formatting conventions that let an investor navigate it without your help.\n\nYou keep the model. We do not use proprietary templates that lock you into coming back to us.',
    durations: [
      { minutes: 60, price: 580000, isDefault: true },
      { minutes: 120, price: 1050000, label: 'Build session' },
    ],
    paymentModel: 'FIXED_DEPOSIT',
    depositAmount: 150000,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM', 'MICROSOFT_TEAMS'],
    preparationNotes: 'Send your current model, however rough. If you have none, send the last two years of management accounts.',
    cancellationPolicy: 'Cancel free of charge up to 24 hours before. Inside 24 hours the deposit is retained.',
    reschedulePolicy: 'Reschedule up to 24 hours before at no cost.',
    leadTimeHours: 48,
    isFeatured: false,
    icon: 'Calculator',
    consultantSlugs: ['david-otieno'],
  },
  {
    slug: 'introductory-call',
    name: 'Introductory Call',
    categorySlug: 'strategy',
    shortDescription:
      'A short, free conversation to work out whether we are the right firm for what you need.',
    fullDescription:
      'A no-charge conversation to understand what you are working on and whether we are genuinely the right people to help.\n\nWe will ask what has prompted you to look for advice now, what you have already tried, and what a good outcome looks like. If we are not the right fit, we will tell you and, where we can, point you toward someone who is.\n\nThere is no obligation and no follow-up sales sequence.',
    durations: [{ minutes: 20, price: 0, label: 'Introductory call', isDefault: true }],
    paymentModel: 'FREE',
    taxRateBps: 0,
    meetingProviders: ['ZOOM', 'GOOGLE_MEET', 'PHONE'],
    preparationNotes: 'Nothing to prepare. Come with the question that brought you here.',
    cancellationPolicy: 'Cancel or reschedule any time before the call at no cost.',
    reschedulePolicy: 'Reschedule freely up to the scheduled start time.',
    leadTimeHours: 4,
    isFeatured: true,
    icon: 'MessageSquare',
    consultantSlugs: ['achieng-mwangi', 'david-otieno', 'priya-wanjiru', 'samuel-kimani', 'nasra-abdi'],
  },
];

export const CLIENTS = [
  { firstName: 'Grace', lastName: 'Njeri', email: 'grace.njeri@savannaagro.co.ke', company: 'Savanna Agro Processors', jobTitle: 'Chief Executive Officer', industry: 'Agriculture', companySize: '51-200', city: 'Nakuru' },
  { firstName: 'Tunde', lastName: 'Adeyemi', email: 'tunde@lagoslogistics.ng', company: 'Lagos Logistics Group', jobTitle: 'Managing Director', industry: 'Logistics', companySize: '201-500', city: 'Lagos' },
  { firstName: 'Fatima', lastName: 'Hassan', email: 'f.hassan@coastalmicrofinance.co.ke', company: 'Coastal Microfinance', jobTitle: 'Chief Operating Officer', industry: 'Financial Services', companySize: '51-200', city: 'Mombasa' },
  { firstName: 'James', lastName: 'Kariuki', email: 'james.kariuki@brightpath.co.ke', company: 'BrightPath Education', jobTitle: 'Founder', industry: 'Education', companySize: '11-50', city: 'Nairobi' },
  { firstName: 'Amina', lastName: 'Yusuf', email: 'amina.yusuf@zawadihealth.co.ke', company: 'Zawadi Health', jobTitle: 'Chief Financial Officer', industry: 'Healthcare', companySize: '51-200', city: 'Nairobi' },
  { firstName: 'Peter', lastName: 'Muriuki', email: 'p.muriuki@highlandcoffee.co.ke', company: 'Highland Coffee Cooperative', jobTitle: 'General Manager', industry: 'Agriculture', companySize: '201-500', city: 'Nyeri' },
  { firstName: 'Lydia', lastName: 'Achieng', email: 'lydia@makinicleaning.co.ke', company: 'Makini Facility Services', jobTitle: 'Operations Director', industry: 'Facilities Management', companySize: '201-500', city: 'Nairobi' },
  { firstName: 'Emmanuel', lastName: 'Ochieng', email: 'e.ochieng@lakesidefisheries.co.ke', company: 'Lakeside Fisheries', jobTitle: 'Chief Executive Officer', industry: 'Food & Beverage', companySize: '51-200', city: 'Kisumu' },
  { firstName: 'Sarah', lastName: 'Mutiso', email: 'sarah.mutiso@tandemhr.co.ke', company: 'Tandem HR Partners', jobTitle: 'Managing Partner', industry: 'Professional Services', companySize: '11-50', city: 'Nairobi' },
  { firstName: 'Brian', lastName: 'Kiptoo', email: 'brian@riftvalleysolar.co.ke', company: 'Rift Valley Solar', jobTitle: 'Chief Technology Officer', industry: 'Energy', companySize: '11-50', city: 'Eldoret' },
  { firstName: 'Mercy', lastName: 'Wambui', email: 'mercy.wambui@urbanretail.co.ke', company: 'Urban Retail Holdings', jobTitle: 'Head of Strategy', industry: 'Retail', companySize: '501-1000', city: 'Nairobi' },
  { firstName: 'Daniel', lastName: 'Mensah', email: 'daniel.mensah@accrafintech.gh', company: 'Accra Fintech Labs', jobTitle: 'Co-Founder', industry: 'Technology', companySize: '11-50', city: 'Accra' },
  { firstName: 'Christine', lastName: 'Wafula', email: 'c.wafula@westernmillers.co.ke', company: 'Western Millers', jobTitle: 'Finance Director', industry: 'Manufacturing', companySize: '201-500', city: 'Kakamega' },
  { firstName: 'Kevin', lastName: 'Omondi', email: 'kevin@sokoexpress.co.ke', company: 'Soko Express', jobTitle: 'Founder & CEO', industry: 'E-commerce', companySize: '11-50', city: 'Nairobi' },
  { firstName: 'Ruth', lastName: 'Chebet', email: 'ruth.chebet@amaniinsurance.co.ke', company: 'Amani Insurance', jobTitle: 'Chief Risk Officer', industry: 'Insurance', companySize: '501-1000', city: 'Nairobi' },
];

export const ARTICLE_CATEGORIES = [
  { slug: 'strategy-notes', name: 'Strategy Notes', description: 'Short pieces on positioning, growth and competitive decisions.' },
  { slug: 'capital', name: 'Capital & Finance', description: 'Fundraising, valuation and financial discipline.' },
  { slug: 'operations', name: 'Operations', description: 'How organisations actually deliver.' },
  { slug: 'leadership', name: 'Leadership', description: 'Executive practice, boards and organisation design.' },
  { slug: 'research', name: 'Research', description: 'Peer-reviewed and long-form research from the Meridian Journal.' },
];

export interface SeedArticle {
  slug: string;
  title: string;
  categorySlug: string;
  excerpt: string;
  content: string;
  tags: string[];
  readingMinutes: number;
  authorSlug: string;
  isJournal?: boolean;
  journalVolume?: string;
  journalIssue?: string;
  doi?: string;
  daysAgo: number;
}

export const ARTICLES: SeedArticle[] = [
  {
    slug: 'the-decision-you-are-actually-avoiding',
    title: 'The decision you are actually avoiding',
    categorySlug: 'strategy-notes',
    excerpt:
      'Most strategy engagements begin with the wrong question. The useful work starts when the team names the decision it has been deferring.',
    content:
      '<p>In the first hour of most strategy engagements, a management team will describe a problem that is real but not the one holding them back. The market is competitive. Margins are compressing. Talent is hard to keep. All true, and none of it actionable on its own.</p><p>The useful question is narrower: <em>what decision have you deferred more than twice?</em> There is almost always one. It has usually been on an agenda, discussed inconclusively, and rolled forward. It is deferred not because the information is missing but because the answer is uncomfortable.</p><h2>Why deferral looks rational</h2><p>Deferral rarely feels like avoidance from the inside. It feels like prudence. More data would help. The market may clarify. A new hire might change the calculus. Each of these is individually defensible, which is exactly why the pattern persists.</p><p>The test we use is simple: ask what evidence would settle the question, then ask when that evidence could realistically arrive. If the honest answer is that no attainable evidence would change the decision, the team is not gathering information. It is waiting for the discomfort to pass.</p><h2>Making the decision smaller</h2><p>The way through is usually not courage but scope. A decision that feels unbearable at full size often becomes tractable when reduced to a reversible first step.</p><p>A client considering exit from a loss-making product line spent eleven months unable to decide. The decision they could make was narrower: stop taking new customers on that line for one quarter and see what the sales team did with the freed capacity. That was reversible, cheap, and produced better information than another analysis.</p><h2>What this means for how you meet</h2><p>If your leadership meetings end with actions but the same items reappear, the agenda is describing symptoms. Try opening the next one by asking each person to name the decision they think the group is avoiding. The answers converge more often than people expect.</p>',
    tags: ['strategy', 'decision-making', 'leadership'],
    readingMinutes: 6,
    authorSlug: 'achieng-mwangi',
    daysAgo: 6,
  },
  {
    slug: 'what-investors-actually-check-in-your-model',
    title: 'What investors actually check in your model',
    categorySlug: 'capital',
    excerpt:
      'Founders polish the wrong parts of a financial model. Here is what an investment committee looks at first, and what it ignores.',
    content:
      '<p>Having reviewed models from both sides — building them for clients and tearing them apart for an investment committee — the gap between what founders polish and what reviewers examine is consistently wide.</p><h2>What gets checked first</h2><p>The first thing a reviewer does is not read your assumptions. It is to check whether the three statements tie. If the balance sheet does not balance, or cash on the balance sheet disagrees with the cash flow statement, the review effectively stops there. Not because the error is fatal, but because it signals that nobody has audited the mechanics — which means every downstream number is unverified.</p><p>Second is the revenue build. Reviewers look for whether revenue is driven by something observable — customers, units, price — or whether it is a growth rate applied to last year. A model that grows revenue 40% annually with no driver behind it is not a forecast. It is an aspiration formatted as a spreadsheet.</p><h2>What gets ignored</h2><p>Formatting beyond basic legibility. Elaborate dashboards. Scenario tabs with fifteen cases. Reviewers typically build their own downside case anyway, and a model with too many scenarios suggests the team has not committed to a view.</p><h2>The question behind the question</h2><p>When an investor asks about your assumptions, they are rarely testing arithmetic. They are testing whether you know which assumptions matter. A founder who says "our model is most sensitive to churn in months four through six, and here is what we are doing about it" has answered a question about judgement, not spreadsheets.</p><p>Build the model so you can answer that question. The rest is presentation.</p>',
    tags: ['fundraising', 'financial-modelling', 'investors'],
    readingMinutes: 5,
    authorSlug: 'david-otieno',
    daysAgo: 13,
  },
  {
    slug: 'your-process-map-is-fiction',
    title: 'Your process map is fiction',
    categorySlug: 'operations',
    excerpt:
      'Documented processes describe how work was supposed to happen. Watching the work reveals the system people actually built to cope.',
    content:
      '<p>Every operations engagement I have run has included the same moment. Someone produces the process documentation, we walk the floor, and within an hour it is clear the two have very little to do with each other.</p><p>This is not a failure of discipline. It is what happens when a documented process meets conditions it was not designed for, and the people doing the work quietly invent something that functions.</p><h2>The workarounds are the data</h2><p>The instinct is to treat divergence as non-compliance and re-train. This is almost always wrong. A workaround that has survived for two years is solving a real problem. Removing it without understanding what it solves reintroduces the problem the team had already fixed.</p><p>A distribution client had a rule that orders above a value threshold required a second approval. In practice, the warehouse team had learned to split large orders into two. The audit finding was policy breach. The actual finding was that the approval step took eleven hours and the delivery promise was six.</p><h2>How to see the real system</h2><p>Three things, in order. Watch the work for a full cycle without intervening. Ask the person doing it what they do when things go wrong — the exception path is where the real design lives. Then look at the timestamps in your own systems, which record what happened rather than what was supposed to.</p><h2>Then redesign</h2><p>Once you can describe the system as it is, redesign becomes tractable. You are no longer arguing about compliance. You are deciding which of the constraints that produced the workarounds you intend to remove.</p>',
    tags: ['operations', 'process', 'delivery'],
    readingMinutes: 6,
    authorSlug: 'priya-wanjiru',
    daysAgo: 21,
  },
  {
    slug: 'buying-technology-you-will-not-regret',
    title: 'Buying technology you will not regret',
    categorySlug: 'operations',
    excerpt: 'Four questions that separate a system you will still be glad you chose in five years from one you will be migrating off.',
    content:
      '<p>Core system decisions are among the few genuinely hard-to-reverse choices an organisation makes. A poor choice is not a bad quarter; it is five years of accumulating cost and constrained options.</p><h2>One: what does this system make hard?</h2><p>Vendors demonstrate what a system makes easy. The more useful question is the inverse. Every system encodes assumptions about how you operate, and the ones that conflict with how you actually work become permanent friction.</p><p>Ask to see the workflow that the product handles least gracefully. A vendor who cannot answer has not thought about it; one who answers candidly is telling you something valuable.</p><h2>Two: how do we get our data out?</h2><p>Ask this before signing, and ask for it in writing. Not "is there an API" but: what is the documented export path for the full dataset, in what format, and what does it cost? Organisations discover the answer at the worst possible moment.</p><h2>Three: who else here has done this migration?</h2><p>Reference calls arranged by the vendor are of limited value. Find an organisation of your size and complexity that implemented two or three years ago — long enough for the honeymoon to end — and ask them what they underestimated.</p><h2>Four: what happens if the vendor is acquired?</h2><p>In a consolidating market this is not hypothetical. Understand the ownership, the product’s position in the portfolio, and whether your contract survives a change of control on the same terms.</p><p>None of these questions are technical. That is the point: the decisions that go wrong are rarely lost on architecture.</p>',
    tags: ['technology', 'procurement', 'due-diligence'],
    readingMinutes: 7,
    authorSlug: 'samuel-kimani',
    daysAgo: 29,
  },
  {
    slug: 'leading-people-who-used-to-be-your-peers',
    title: 'Leading people who used to be your peers',
    categorySlug: 'leadership',
    excerpt:
      'The most common coaching topic among newly promoted leaders, and the mistake nearly all of them make in the first month.',
    content:
      '<p>Of the executives I coach through a first significant promotion, the majority are managing people who were their colleagues weeks earlier. It is the most predictable transition in organisational life and among the least well supported.</p><h2>The common mistake</h2><p>The instinctive move is to minimise the change. To signal that nothing is different, that the friendships hold, that the new title is administrative. This is well-intentioned and it does not work, because it is not true and everyone knows it.</p><p>What follows is a period where the leader avoids exercising authority to preserve the relationship, the team becomes uncertain about where decisions now sit, and the eventual assertion of authority lands harder for having been delayed.</p><h2>Naming it instead</h2><p>The alternative is to name the change directly and early, individually rather than in a group. The conversation is short: acknowledge that the relationship has changed, say what you will do differently, ask what they need from you, and be explicit that you would rather discuss the awkwardness than pretend it is absent.</p><p>Most people receive this with relief. They have been navigating the same ambiguity without permission to mention it.</p><h2>What actually changes</h2><p>Two things, mainly. You now hold information you cannot share, and you will make decisions that disadvantage someone you like. Both are survivable. Neither is survivable if you have pretended the relationship is unchanged.</p><p>The leaders who make this transition well are not the ones who care least about the friendships. They are the ones who were honest about the cost early enough for the relationship to adjust.</p>',
    tags: ['leadership', 'coaching', 'transitions'],
    readingMinutes: 5,
    authorSlug: 'nasra-abdi',
    daysAgo: 38,
  },
  {
    slug: 'pricing-is-a-strategy-decision',
    title: 'Pricing is a strategy decision, not a finance one',
    categorySlug: 'strategy-notes',
    excerpt: 'When pricing sits with finance, it optimises margin. When it sits with strategy, it selects customers.',
    content:
      '<p>In most mid-sized organisations, pricing lives with finance. This is administratively sensible and strategically costly, because it frames price as a margin lever rather than what it actually is: the primary mechanism by which you choose your customers.</p><h2>Price selects who shows up</h2><p>A price change does not simply move revenue per unit. It changes the composition of who buys. Lower the price and you acquire customers with different expectations, different service intensity and different retention. The margin arithmetic on the existing base tells you almost nothing about this.</p><p>A client reduced prices 12% to defend share. Volume rose as forecast. What the model had not captured was that the incoming cohort raised support tickets at three times the rate and churned at twice. Contribution per customer fell below the pre-change level within two quarters.</p><h2>The questions to ask first</h2><p>Before modelling elasticity, answer three strategy questions. Which customers do we most want more of? What do those customers use to judge whether we are expensive? What would we have to be true about our offer for them to accept a higher price?</p><p>Only then is the finance work useful, because it now has a target to optimise against.</p><h2>Where to put the decision</h2><p>Pricing authority belongs with whoever owns the answer to "who are we for". Finance should hold the model, the discipline and the veto on decisions that break the economics. It should not hold the pen.</p>',
    tags: ['pricing', 'strategy', 'growth'],
    readingMinutes: 5,
    authorSlug: 'achieng-mwangi',
    daysAgo: 47,
  },
  {
    slug: 'working-capital-is-where-growth-dies',
    title: 'Working capital is where growth dies',
    categorySlug: 'capital',
    excerpt: 'Profitable companies fail while growing. The mechanism is dull, well understood, and routinely missed.',
    content:
      '<p>The most common cause of distress among the growing companies we see is not unprofitability. It is working capital.</p><p>The mechanism is not subtle. Growth consumes cash before it produces it: inventory ahead of sales, receivables ahead of collection, payroll ahead of invoicing. A business growing 50% a year with 60-day receivables and 30-day payables funds a widening gap out of a balance sheet that was sized for last year.</p><h2>Why it gets missed</h2><p>Management reporting usually leads with revenue and margin. The cash conversion cycle, if reported at all, appears as a working capital line without decomposition. Nobody is watching the components move.</p><p>The second reason is that the problem arrives during good news. The month the gap becomes critical is usually the best sales month on record.</p><h2>What to watch</h2><p>Three numbers, monthly, decomposed: days sales outstanding, days inventory outstanding, days payables outstanding. Track them as a trend, not a point. A DSO drifting from 42 to 51 over two quarters is a more important signal than most items on a management pack.</p><p>Then model the cash requirement of your growth plan explicitly, at the plan’s growth rate and at 1.5x it. The second case is the one that matters, because growth exceeding plan is when the gap bites.</p><h2>The uncomfortable conclusion</h2><p>Sometimes the right answer is to grow more slowly than you could. This is a legitimate strategic choice, and it is far easier to make deliberately in advance than under pressure from a bank.</p>',
    tags: ['finance', 'working-capital', 'growth'],
    readingMinutes: 6,
    authorSlug: 'david-otieno',
    daysAgo: 58,
  },
  {
    slug: 'meridian-journal-advisory-adoption-east-africa',
    title: 'Determinants of advisory service adoption among mid-market firms in East Africa',
    categorySlug: 'research',
    excerpt:
      'A study of 412 firms across Kenya, Uganda and Tanzania examining what predicts engagement with external advisory services, and what predicts satisfaction with it.',
    content:
      '<h2>Abstract</h2><p>Mid-market firms in East Africa engage external advisory services at materially lower rates than comparable firms in other emerging markets, despite reporting similar categories of managerial constraint. This study examines the determinants of adoption across 412 firms with annual revenue between USD 1m and USD 50m in Kenya, Uganda and Tanzania, surveyed between March and September 2025.</p><h2>Method</h2><p>A stratified sample was drawn from national business registries and industry association membership lists, stratified by revenue band, sector and country. Structured interviews were conducted with the most senior finance or general management decision-maker. Response rate was 63.4% (n=412 of 650 approached). Adoption was measured as any paid engagement with an external advisory firm in the preceding 24 months.</p><h2>Findings</h2><p>Three variables carried most of the explanatory weight. Prior exposure to formal external capital was the strongest single predictor (odds ratio 3.8, p&lt;0.001): firms that had raised institutional equity or bank debt above USD 500,000 adopted advisory services at 2.9 times the rate of those that had not. Second, the presence of at least one non-executive director was associated with a 2.1x adoption rate (p&lt;0.01). Third, and contrary to expectation, firm size within the sampled band had no significant independent effect once the first two variables were controlled for.</p><p>Price sensitivity was frequently cited in open responses (68% of non-adopters) but did not survive as a predictor in the regression once governance variables were included, suggesting cost is a stated rather than operative barrier.</p><h2>Satisfaction</h2><p>Among adopters (n=173), satisfaction correlated most strongly with the specificity of the engagement scope at contracting (r=0.61) rather than with engagement size, firm reputation, or consultant seniority. Engagements scoped around a named decision reported satisfaction of 4.3/5; those scoped as general strategic review reported 2.9/5.</p><h2>Implications</h2><p>The governance findings suggest that adoption is mediated less by perceived need than by the presence of an external party who expects the question to have been examined. For advisory firms, the satisfaction finding argues for resisting broad scopes even when a client requests one.</p><h2>Limitations</h2><p>Self-reported adoption is subject to recall error, and the sample excludes firms below USD 1m revenue where dynamics may differ substantially. Causality between governance structures and adoption cannot be established from cross-sectional data.</p>',
    tags: ['research', 'advisory', 'east-africa', 'governance'],
    readingMinutes: 14,
    authorSlug: 'achieng-mwangi',
    isJournal: true,
    journalVolume: 'Volume 4',
    journalIssue: 'Issue 2',
    doi: '10.5281/meridian.2026.0402',
    daysAgo: 72,
  },
  {
    slug: 'meridian-journal-operating-model-transitions',
    title: 'Operating model transitions in founder-led firms: a longitudinal case series',
    categorySlug: 'research',
    excerpt:
      'Eleven founder-led firms tracked through the transition to professional management, examining which structural changes preceded sustained performance improvement.',
    content:
      '<h2>Abstract</h2><p>The transition from founder-led to professionally managed operation is widely described and poorly evidenced. This paper reports a longitudinal case series of eleven firms tracked over 36 months through such a transition, identifying which structural changes preceded sustained improvement in delivery performance and which did not.</p><h2>Method</h2><p>Eleven firms (43 to 380 employees) were followed from the point at which the founder first delegated profit-and-loss responsibility. Quarterly data collection covered organisational structure, decision rights, delivery metrics and staff turnover. Two firms withdrew after month 18; findings are reported for the remaining nine.</p><h2>Findings</h2><p>Sustained delivery improvement was observed in six of nine firms. In all six, a specific sequence recurred: decision rights were documented before structure changed, and structure changed before headcount grew. In the three firms without sustained improvement, headcount growth preceded clarification of decision rights in every case.</p><p>The most frequently attempted intervention — hiring a senior operator into a newly created role — was neither necessary nor sufficient. Four of the six improving firms did so; so did all three non-improving firms.</p><p>Founder behaviour was the strongest differentiator. In improving firms, founders retained a named remit and were observably absent from decisions outside it. In non-improving firms, founders described having delegated while continuing to intervene episodically, which staff interviews consistently identified as the primary source of ambiguity.</p><h2>Discussion</h2><p>The results suggest that the binding constraint in these transitions is rarely capability and frequently clarity about where authority now sits. Interventions that add capacity without resolving that ambiguity appear to increase coordination cost without improving delivery.</p><h2>Limitations</h2><p>Small sample, no control group, and selection bias toward firms willing to be observed during a difficult transition. Findings should be read as hypothesis-generating.</p>',
    tags: ['research', 'operating-model', 'founder-led', 'organisation-design'],
    readingMinutes: 12,
    authorSlug: 'priya-wanjiru',
    isJournal: true,
    journalVolume: 'Volume 4',
    journalIssue: 'Issue 1',
    doi: '10.5281/meridian.2026.0401',
    daysAgo: 96,
  },
  {
    slug: 'the-board-pack-nobody-reads',
    title: 'The board pack nobody reads',
    categorySlug: 'leadership',
    excerpt: 'Two hundred pages, circulated three days late, structured for the executive who wrote it. There is a better default.',
    content:
      '<p>Board packs have a way of growing. Each addition is individually justified — a committee asked for it, a regulator expects it, an incident prompted it — and the aggregate becomes something no director can meaningfully absorb before the meeting.</p><h2>The symptom to watch</h2><p>The reliable indicator is not length. It is where discussion time goes. If a board spends most of its meeting being walked through material it has already received, the pack has failed, because reading aloud is what happens when nobody trusts that the pack was read.</p><h2>A better default structure</h2><p>Three sections, in this order. First, decisions required at this meeting, each on a single page: the decision, the recommendation, the two or three considerations that could change it, and what happens if it is deferred. Second, matters for discussion but not decision. Third, everything else as appendix, clearly labelled as reference.</p><p>The discipline is that anything in the third section is not presented. Directors read it or they do not; it does not consume meeting time.</p><h2>Timing</h2><p>A pack circulated less than five clear days before the meeting has not been read, whatever anyone says. If the pack cannot be ready five days out, the problem is the reporting cycle, not the deadline — and that is itself a matter for the board.</p><h2>What improves</h2><p>Boards that make this change typically report the same two effects: meetings shorten, and the questions get harder. Both are the intended outcome.</p>',
    tags: ['governance', 'boards', 'leadership'],
    readingMinutes: 4,
    authorSlug: 'nasra-abdi',
    daysAgo: 110,
  },
];

export const PRODUCT_CATEGORIES = [
  { slug: 'books', name: 'Books', description: 'Full-length works from the Meridian partnership.', icon: 'BookOpen' },
  { slug: 'journals', name: 'Journals', description: 'Collected issues of the Meridian Advisory Journal.', icon: 'BookMarked' },
  { slug: 'reports', name: 'Reports', description: 'Sector and market research reports.', icon: 'FileText' },
  { slug: 'guides', name: 'Guides', description: 'Practical guides for specific decisions.', icon: 'Compass' },
  { slug: 'templates', name: 'Templates', description: 'Working models and document templates.', icon: 'LayoutTemplate' },
  { slug: 'research', name: 'Research', description: 'Primary research datasets and methodology papers.', icon: 'Microscope' },
  { slug: 'courses', name: 'Courses', description: 'Recorded programmes and workshop materials.', icon: 'GraduationCap' },
];

export interface SeedProduct {
  slug: string;
  name: string;
  categorySlug: string;
  shortDescription: string;
  description: string;
  author: string;
  price: number;
  compareAtPrice?: number;
  type: 'DIGITAL' | 'PHYSICAL';
  stock?: number | null;
  isbn?: string;
  pages?: number;
  publishedYear?: number;
  isFeatured: boolean;
  sku: string;
}

export const PRODUCTS: SeedProduct[] = [
  {
    slug: 'decisions-that-compound',
    name: 'Decisions That Compound',
    categorySlug: 'books',
    shortDescription: 'A practical account of how mid-market firms make the small number of choices that determine the next decade.',
    description:
      '<p>Drawn from eighteen years of advisory work across East and West Africa, <em>Decisions That Compound</em> examines the handful of decisions that disproportionately shape a company’s trajectory — and why organisations reliably defer exactly those.</p><p>The book is organised around eleven decisions: entering a market, changing a price, replacing a core system, hiring the first executive outside the founding group, taking outside capital, and six more. Each chapter follows the same structure: what the decision looks like from the inside, how it is typically approached, what the evidence suggests, and how to make it smaller.</p><p>Written for chief executives, boards and the advisers who work with them. Case material is drawn from real engagements, anonymised with the consent of the organisations involved.</p>',
    author: 'Achieng Mwangi',
    price: 480000,
    compareAtPrice: 550000,
    type: 'PHYSICAL',
    stock: 84,
    isbn: '978-9966-000-01-4',
    pages: 312,
    publishedYear: 2025,
    isFeatured: true,
    sku: 'BK-DTC-2025',
  },
  {
    slug: 'decisions-that-compound-ebook',
    name: 'Decisions That Compound (eBook)',
    categorySlug: 'books',
    shortDescription: 'The complete book in EPUB and PDF, readable on any device.',
    description:
      '<p>The full text of <em>Decisions That Compound</em>, delivered as a DRM-free EPUB and PDF bundle. Includes the appendix of decision worksheets, which are not in the print edition.</p><p>Your download links are generated fresh from your portal each time and expire shortly after issue, so open them from <strong>My Resources</strong> when you need them.</p>',
    author: 'Achieng Mwangi',
    price: 280000,
    type: 'DIGITAL',
    stock: null,
    pages: 312,
    publishedYear: 2025,
    isFeatured: true,
    sku: 'EB-DTC-2025',
  },
  {
    slug: 'meridian-journal-volume-4',
    name: 'Meridian Advisory Journal — Volume 4',
    categorySlug: 'journals',
    shortDescription: 'Both 2026 issues, collecting six peer-reviewed papers on advisory practice and organisation design.',
    description:
      '<p>Volume 4 collects both 2026 issues of the Meridian Advisory Journal, comprising six peer-reviewed papers on advisory practice, operating model transitions and governance in mid-market firms across sub-Saharan Africa.</p><p>Includes the full dataset appendix for the East Africa advisory adoption study, supplied as CSV alongside the PDF.</p>',
    author: 'Meridian Advisory (ed.)',
    price: 350000,
    type: 'DIGITAL',
    stock: null,
    pages: 186,
    publishedYear: 2026,
    isFeatured: true,
    sku: 'JR-V4-2026',
  },
  {
    slug: 'east-africa-mid-market-report-2026',
    name: 'East Africa Mid-Market Outlook 2026',
    categorySlug: 'reports',
    shortDescription: 'Sector-by-sector analysis of growth, margin and capital conditions for firms between USD 1m and USD 50m.',
    description:
      '<p>An annual research report covering growth, margin and capital conditions for mid-market firms across Kenya, Uganda, Tanzania and Rwanda.</p><p>Built on survey responses from 412 firms and interviews with 38 capital providers. Covers eleven sectors with comparable metrics, a chapter on financing conditions, and a methodology appendix.</p><p>Delivered as a 94-page PDF with the underlying aggregate data in spreadsheet form.</p>',
    author: 'Meridian Research',
    price: 950000,
    type: 'DIGITAL',
    stock: null,
    pages: 94,
    publishedYear: 2026,
    isFeatured: true,
    sku: 'RP-EAMM-2026',
  },
  {
    slug: 'fundraising-readiness-checklist',
    name: 'The Fundraising Readiness Guide',
    categorySlug: 'guides',
    shortDescription: 'What to have in place before you approach investors, with the data room index we use in reviews.',
    description:
      '<p>A working guide to preparing for an institutional raise between USD 1m and USD 30m. Covers the model, the deck, the data room and the diligence questions that most often derail a process.</p><p>Includes the annotated data room index used in our readiness reviews, and a self-assessment that scores your current state against what investors expect at each stage.</p>',
    author: 'David Otieno',
    price: 180000,
    type: 'DIGITAL',
    stock: null,
    pages: 48,
    publishedYear: 2026,
    isFeatured: false,
    sku: 'GD-FRG-2026',
  },
  {
    slug: 'three-statement-model-template',
    name: 'Three-Statement Financial Model Template',
    categorySlug: 'templates',
    shortDescription: 'An unlocked, fully documented Excel model with driver-based revenue and integrated statements.',
    description:
      '<p>The three-statement model we build with clients, supplied unlocked and fully documented. Driver-based revenue build, integrated income statement, balance sheet and cash flow, working capital schedule, debt schedule and a scenario switch.</p><p>Every formula is visible and commented. There are no hidden sheets and no proprietary add-ins — the model is yours to modify.</p><p>Includes a 20-page build guide explaining the structure and how to extend it.</p>',
    author: 'David Otieno',
    price: 240000,
    type: 'DIGITAL',
    stock: null,
    publishedYear: 2026,
    isFeatured: true,
    sku: 'TP-3SM-2026',
  },
  {
    slug: 'operating-model-diagnostic-toolkit',
    name: 'Operating Model Diagnostic Toolkit',
    categorySlug: 'templates',
    shortDescription: 'The interview guides, observation sheets and analysis templates used in our operations reviews.',
    description:
      '<p>The instruments we use in an operating model review, packaged for internal teams to run themselves.</p><p>Includes structured interview guides for four role types, a process observation sheet, a decision rights mapping template, and an analysis workbook that turns the collected data into a constraint map.</p><p>Suitable for an internal team with some analytical capability. Not a substitute for an external review where independence matters.</p>',
    author: 'Priya Wanjiru',
    price: 320000,
    type: 'DIGITAL',
    stock: null,
    publishedYear: 2026,
    isFeatured: false,
    sku: 'TP-OMD-2026',
  },
  {
    slug: 'technology-due-diligence-framework',
    name: 'Technology Due Diligence Framework',
    categorySlug: 'guides',
    shortDescription: 'The assessment framework used in our technical diligence, with scoring rubrics and a findings template.',
    description:
      '<p>The framework behind our technology due diligence engagements: eight assessment domains, scoring rubrics for each, and the evidence to request under every heading.</p><p>Includes a findings report template that grades issues by materiality and remediation cost, and guidance on what to conclude when access is limited — including how to say so without overstating confidence.</p>',
    author: 'Samuel Kimani',
    price: 420000,
    type: 'DIGITAL',
    stock: null,
    pages: 62,
    publishedYear: 2026,
    isFeatured: false,
    sku: 'GD-TDD-2026',
  },
  {
    slug: 'board-effectiveness-workbook',
    name: 'The Board Effectiveness Workbook',
    categorySlug: 'books',
    shortDescription: 'A practical workbook for chairs conducting a board review without external facilitation.',
    description:
      '<p>Written for chairs who want to conduct a serious board review without engaging a facilitator. The workbook sets out a six-week process, from framing the review through to presenting findings to the board.</p><p>Includes the director self-assessment instrument, an observation framework for meeting dynamics, a board paper quality rubric, and guidance on handling the findings that are uncomfortable to raise.</p>',
    author: 'Nasra Abdi',
    price: 390000,
    type: 'PHYSICAL',
    stock: 42,
    isbn: '978-9966-000-02-1',
    pages: 176,
    publishedYear: 2026,
    isFeatured: false,
    sku: 'BK-BEW-2026',
  },
  {
    slug: 'pricing-strategy-masterclass',
    name: 'Pricing Strategy Masterclass (Recorded)',
    categorySlug: 'courses',
    shortDescription: 'A recorded four-session programme on pricing as a customer-selection decision.',
    description:
      '<p>Four recorded sessions, roughly ninety minutes each, on pricing as a strategic rather than financial decision.</p><p>Session one covers who your price selects for. Session two, the analytical work that follows once that is settled. Session three, executing a price change without losing the customers you meant to keep. Session four, a worked case from a regional retailer, including the numbers.</p><p>Includes the workbook and the pricing analysis template used in the case.</p>',
    author: 'Achieng Mwangi',
    price: 680000,
    compareAtPrice: 850000,
    type: 'DIGITAL',
    stock: null,
    publishedYear: 2026,
    isFeatured: true,
    sku: 'CR-PSM-2026',
  },
];

/** Review bodies keyed loosely by service so seeded reviews read plausibly. */
export const REVIEW_BODIES: { rating: number; title: string; body: string }[] = [
  {
    rating: 5,
    title: 'Cut through six months of circling',
    body: 'We had been going round the same market entry question since the start of the year. Achieng spent ten minutes on our numbers and asked the one question none of us had put on the table. We made the decision that week. The written summary afterwards was genuinely useful — not a rehash of what we said, but a clear statement of what we had decided and why.',
  },
  {
    rating: 5,
    title: 'Blunt in the way we needed',
    body: 'David went through our model and found three assumptions that would not have survived a first investor meeting. He was direct about it without being dismissive, and showed us how to fix each one. We raised four months later. I am fairly sure the review is why the process was as smooth as it was.',
  },
  {
    rating: 4,
    title: 'Practical and grounded',
    body: 'Priya spent the session asking about how work actually moves through our warehouse rather than what our process documents claim. Some of what she found was uncomfortable. The recommendations were sequenced so we could act on them without stopping operations, which mattered. Only reason this is not five stars is that we needed more time than the hour allowed.',
  },
  {
    rating: 5,
    title: 'Saved us from a bad acquisition',
    body: 'Samuel reviewed the technology estate of a company we were close to acquiring. He found a dependency on one engineer that nobody had disclosed, and was clear about which of his findings he was confident in and which he could not verify with the access he had. We renegotiated. That distinction between confident and unverified is rarer than it should be.',
  },
  {
    rating: 5,
    title: 'The conversation I had been avoiding',
    body: 'I was promoted over people who had been my peers for six years and was handling it badly by pretending nothing had changed. Nasra named that in the first session. The advice was specific and I could act on it the same week. Three sessions in, the team is noticeably clearer about where decisions sit.',
  },
  {
    rating: 4,
    title: 'Good value for a short session',
    body: 'Booked the thirty-minute format expecting it to be a sales conversation. It was not. We covered a specific pricing question properly and I left with something I could implement. Would book the longer session next time — thirty minutes went quickly.',
  },
  {
    rating: 5,
    title: 'Clear-eyed about our operating model',
    body: 'What I valued most was that the diagnosis distinguished between problems we could fix quickly and structural constraints that needed a bigger decision. Too much advice treats everything as equally urgent. This did not.',
  },
  {
    rating: 5,
    title: 'Rebuilt our board pack',
    body: 'Our packs had grown to over two hundred pages and directors were arriving unprepared. The review was direct about why. We restructured along the lines suggested and the last two meetings have been shorter and considerably harder. That was the point.',
  },
  {
    rating: 4,
    title: 'Solid financial review',
    body: 'Thorough walkthrough of our model with sensible suggestions on the working capital schedule, which we had been treating too simply. Prep expectations were clear and the session ran on time. Would use again ahead of our next raise.',
  },
  {
    rating: 5,
    title: 'Worth the preparation',
    body: 'They asked for our documents 48 hours ahead and had genuinely read them. The whole session was findings rather than orientation, which is not what I have experienced elsewhere. Efficient use of an hour.',
  },
  {
    rating: 5,
    title: 'Told us not to hire',
    body: 'We came in expecting to be told which senior operator to recruit. Instead we spent the session on decision rights and left having decided to delay the hire by two quarters. It would have been easy to sell us the thing we asked for.',
  },
  {
    rating: 4,
    title: 'Useful, and honest about scope',
    body: 'Half an hour in, it was clear our question was bigger than the session. They said so and set out what a fuller piece of work would involve, without pressure. We used the remaining time well and are now considering the larger engagement.',
  },
];
