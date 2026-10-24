// level: the plan level needed to practise the subject (0 = free, 1 = Student)
export const SUBJECTS = {
  eng: { name: 'Use of English', level: 0 },
  mat: { name: 'Mathematics', level: 0 },
  phy: { name: 'Physics', level: 1 },
  chm: { name: 'Chemistry', level: 1 },
  bio: { name: 'Biology', level: 1 },
  gov: { name: 'Government', level: 1 },
  eco: { name: 'Economics', level: 1 },
  com: { name: 'Commerce', level: 1 },
  agr: { name: 'Agricultural Science', level: 1 },
  acc: { name: 'Accounts', level: 1 },
  mkt: { name: 'Marketing', level: 1 },
  lit: { name: 'Literature in English', level: 1 },
  irk: { name: 'Islamic Religious Knowledge', level: 1 },
  crk: { name: 'Christian Religious Knowledge', level: 1 },
}
export const SUBJECT_KEYS = Object.keys(SUBJECTS)
/** English is automatic in the mock, so students choose their 3 from these. */
export const PICKABLE = SUBJECT_KEYS.filter((k) => k !== 'eng')

export const PRACTICE_SIZE = 20 // questions per practice session
export const MOCK_PER_SUBJECT = 20 // questions per subject in a mock
export const SECONDS_PER_QUESTION = 40 // the real UTME pace (2 hours for 180 questions)

// Prices shown here are only a fallback. The real prices come from the `plans` table in the database.
export const PLANS = [
  { id: 'free', name: 'Free', kobo: 0, features: ['English and Maths practice', 'Progress tracking', 'Aggregate calculator'] },
  { id: 'student', name: 'Student', kobo: 150000, features: ['All 14 subjects', 'Timed CBT mock exams, scored out of 400', 'Everything in Free'] },
  { id: 'pro', name: 'Pro', kobo: 300000, features: ['Personal study planner', 'Weak-subject focus each week', 'Everything in Student'] },
]

export const HOW = [
  ['Get in', 'Sign up with your email, or type the Access PIN from your tutor or school.'],
  ['Set up your profile', 'Add your photo, course, target university and your 3 subjects.'],
  ['Practise by subject', 'Answer questions and read a short explanation whenever you get one wrong.'],
  ['Take CBT mocks', 'Sit a timed exam at the real pace, see your score out of 400 and follow your study plan.'],
]

export const FAQ = [
  ['Is JAMBwise affiliated with JAMB?', 'No. JAMBwise is an independent practice platform and is not affiliated with or endorsed by JAMB.'],
  ['Are these real JAMB past questions?', 'No. Our questions are original and written in the style of the UTME syllabus. They are for practice only.'],
  ['How does the CBT mock work?', 'Choose your 3 subjects. You get English plus those subjects, with a countdown at the real exam pace of 40 seconds a question, scored out of 400.'],
  ['How do I get an Access PIN?', 'Your tutor, school or the JAMBwise team can give you one. Type it in the Access PIN box on the homepage to get in without an email.'],
  ['Can I use JAMBwise on my phone?', 'Yes. It works in any modern phone browser.'],
  ['How do I change my plan?', 'Open Plans in the sidebar and choose a plan. You pay securely with Paystack and your plan is active for 30 days.'],
  ['How is my data kept?', 'Read our Privacy Policy. You can delete your account any time in Settings.'],
]

export const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    lead: 'We collect only what we need to run your practice account, we never sell your data, and you can delete everything whenever you like.',
    glance: [
      ['shield', 'We never sell your data', 'Your details are used to run JAMBwise, not to build ad profiles.'],
      ['card', 'Cards stay with Paystack', 'Card numbers go straight to Paystack and never reach our servers.'],
      ['trash', 'Delete any time', 'Settings > Delete account removes your profile and results.'],
    ],
    sections: [
      ['Who we are', ['JAMBwise is an exam practice platform for JAMB candidates in Nigeria. This policy explains what we collect, why we collect it and what choices you have.', 'JAMBwise is an independent service. It is not run by or connected to JAMB.']],
      ['What we collect', ['Account details: your name, and either your email address or the Access PIN you used to sign in.', 'Profile details you choose to add: photo, course, target university, exam date and subjects.', 'Study data: your practice and mock results, so we can show your progress and study plan.', 'Billing data: which plan you bought, the amount and the payment status. We do not see or store your card number.', 'Support messages: anything you send through Customer Support or the Contact page, and our replies.']],
      ['How we use it', ['To create and protect your account, show your progress, build your study planner and give you support.', 'To process payments and keep a record that you paid.', 'To fix problems and improve questions and features. We look at totals and trends, not at individual students, unless you ask us for help.', 'We do not sell your data and we do not show third-party advertising.']],
      ['Where it is stored', ['Your data is stored with our database host, Supabase, on secure servers with access rules that stop one student from reading another student\'s data.', 'Card payments are handled by Paystack. Paystack is responsible for your card details.']],
      ['Sharing', ['We share data only with the providers who help us run the service, such as our database host and payment partner, and only what they need.', 'We may disclose information if the law requires it or to protect our users and platform from abuse.']],
      ['Cookies and browser storage', ['We use your browser\'s local storage to keep you signed in and to remember choices such as light or dark theme. We do not use advertising cookies.']],
      ['How long we keep data', ['We keep your account and results while your account is open. When you delete your account, your profile and results are erased. We keep payment records for accounting and legal reasons.']],
      ['Your rights', ['Under the Nigeria Data Protection Act 2023 you may ask to see, correct or delete your personal data, and to object to how it is used.', 'You can edit your profile in My Profile and delete your account in Settings. For anything else, contact us and we will respond promptly.']],
      ['Parent access', ['A student can make a parent code in Settings and share it, with their Student ID, with a parent or guardian. Someone who has both can sign in on the home page and see the student\'s scores, subjects, mock results and activity for 60 minutes. They cannot see the student\'s email, messages or password, and they cannot change anything.', 'The code lasts 7 days. The student can renew it or switch it off at any time, and is told each time someone signs in. We record the name the parent entered, their relationship to the student, the time and a short browser description (for example Chrome on Android), including failed attempts, so that admins can spot misuse. Parents can only try a few times before being locked out for a while.']],
      ['Young users', ['Many candidates are under 18. If you are under 18, please use JAMBwise with the knowledge of a parent or guardian.']],
      ['Changes to this policy', ['If we change this policy in a way that matters, we will update the date at the top of this page and, where appropriate, tell you in the app.']],
      ['Contact us', ['Questions or requests about your data: use the Contact page or email support@jambwise.ng.']],
    ],
  },
  terms: {
    title: 'Terms and Conditions',
    lead: 'The simple rules for using JAMBwise: look after your account, use the content fairly, and know what each plan includes.',
    glance: [
      ['book', 'Independent practice tool', 'Not affiliated with JAMB. We cannot guarantee a score or admission.'],
      ['key', 'One PIN, one student', 'Keep your login and Access PIN private. Sharing may lead to suspension.'],
      ['clock', 'Plans last 30 days', 'Each payment gives 30 days of the features listed for that plan.'],
    ],
    sections: [
      ['About JAMBwise', ['JAMBwise is an independent practice platform. It is not affiliated with or endorsed by JAMB, and it does not guarantee any exam score or admission.', 'Our questions are original practice material written for JAMBwise. They are not real JAMB past questions.']],
      ['Accounts and Access PINs', ['Keep your login and Access PIN private. A PIN is for one student only and can be used once.', 'You are responsible for activity on your account. We may suspend or close accounts that share PINs, abuse the service or break these terms.']],
      ['Plans and payments', ['Prices are in naira and shown on the Plans page. A paid plan gives access to the features listed for it for 30 days from payment, and a new payment adds another 30 days.', 'Payments are processed by Paystack. If you were charged but your plan did not change, open a Customer Support ticket with your payment reference and we will fix it.', 'Because access is delivered digitally and immediately, payments are generally not refundable, except where the law requires it or where we failed to give you the access you paid for.']],
      ['Our content', ['Questions, explanations, designs and software belong to JAMBwise. You may use them for your own studying. Do not copy, resell or share them in bulk.']],
      ['Fair use', ['Do not try to break the app, reach the data of other students, automate access to the questions or use the service for anything unlawful.', 'Be respectful in tickets and messages to our team.']],
      ['No guarantee', ['We work to keep content accurate, but it is provided as is. Always confirm exam dates, subjects and requirements with JAMB and your chosen institution.', 'To the extent the law allows, JAMBwise is not liable for losses that come from relying on practice results as a prediction of exam performance.']],
      ['Ending your account', ['You can delete your account at any time in Settings. We may suspend or end access if these terms are broken. Payment records are kept for accounting.']],
      ['Changes to these terms', ['We may update these terms. If we make an important change we will update the date on this page. Continuing to use JAMBwise after a change means you accept the new terms.']],
      ['Governing law', ['These terms are governed by the laws of the Federal Republic of Nigeria.']],
      ['Contact us', ['Questions about these terms: use the Contact page or email support@jambwise.ng.']],
    ],
  },
}

export const LEGAL_UPDATED = '22 October 2026'
