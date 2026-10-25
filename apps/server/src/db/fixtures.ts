/**
 * DEVELOPMENT / TEST FIXTURES ONLY.
 * These questions are author-drafted placeholders to exercise the engine. They have NOT been reviewed by
 * a qualified scholar and are flagged `is_fixture`, so production refuses to select them
 * (ALLOW_FIXTURE_QUESTIONS must be false in production). Replace with reviewed content before launch.
 */
export interface FixtureQuestion { t: string; o: [string, string, string, string]; c: number; e: string; l: number; r?: string }

export const FIXTURE_CATEGORIES = [
  { slug: 'quran', name: 'Qur’an', description: 'The structure, surahs and themes of the Qur’an.', sort: 1 },
  { slug: 'hadith', name: 'Hadith', description: 'Collections, compilers and well-known narrations.', sort: 2 },
  { slug: 'seerah', name: 'Seerah', description: 'The life of the Prophet ﷺ and the early community.', sort: 3 },
  { slug: 'prophets', name: 'Stories of the Prophets', description: 'Prophets and the lessons of their stories.', sort: 4 },
  { slug: 'history', name: 'Islamic History', description: 'Caliphates, scholars and civilisation.', sort: 5 },
  { slug: 'practices', name: 'Everyday Practices', description: 'Worship and daily Islamic practice.', sort: 6 },
] as const;

export const FIXTURE_QUESTIONS: Record<string, FixtureQuestion[]> = {
  quran: [
    { t: 'How many surahs are in the Qur’an?', o: ['110', '114', '120', '124'], c: 1, e: 'The Qur’an has 114 surahs.', l: 1 },
    { t: 'Which surah is the opening chapter of the Qur’an?', o: ['Al-Baqarah', 'An-Nas', 'Al-Fatihah', 'Al-Ikhlas'], c: 2, e: 'Al-Fatihah (“The Opening”) is the first surah.', l: 1 },
    { t: 'Which is the longest surah in the Qur’an?', o: ['Al-Baqarah', 'Aal ‘Imran', 'An-Nisa', 'Al-A‘raf'], c: 0, e: 'Al-Baqarah has 286 verses.', l: 1 },
    { t: 'Surah An-Nahl is named after which creature?', o: ['The ant', 'The bee', 'The spider', 'The elephant'], c: 1, e: 'An-Nahl means “The Bee” (surah 16).', l: 2 },
    { t: 'In which month was the Qur’an first revealed?', o: ['Rajab', 'Shaban', 'Ramadan', 'Muharram'], c: 2, e: 'The Qur’an began to be revealed in Ramadan.', l: 1, r: 'Qur’an 2:185' },
    { t: 'Which surah does NOT begin with “Bismillah”?', o: ['Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud'], c: 1, e: 'At-Tawbah (surah 9) is the surah that does not open with the Basmalah.', l: 3 },
    { t: 'How many verses does Surah Al-Fatihah have?', o: ['5', '6', '7', '8'], c: 2, e: 'Al-Fatihah has seven verses.', l: 2 },
    { t: 'Which surah is named after a cave?', o: ['Al-Kahf', 'Maryam', 'Al-Hijr', 'Ta-Ha'], c: 0, e: 'Al-Kahf means “The Cave” (surah 18).', l: 1 },
    { t: 'Ayat al-Kursi is found in which surah?', o: ['Aal ‘Imran', 'Al-Baqarah', 'An-Nisa', 'Al-Ma’idah'], c: 1, e: 'Ayat al-Kursi is verse 255 of Al-Baqarah.', l: 3, r: 'Qur’an 2:255' },
    { t: 'What is the number of Surah Al-Ikhlas in the Qur’an?', o: ['108', '110', '112', '114'], c: 2, e: 'Al-Ikhlas is the 112th surah.', l: 4 },
  ],
  hadith: [
    { t: 'Who compiled Sahih al-Bukhari?', o: ['Muslim ibn al-Hajjaj', 'Muhammad ibn Ismail al-Bukhari', 'Abu Dawud', 'Al-Tirmidhi'], c: 1, e: 'Imam Muhammad ibn Ismail al-Bukhari compiled it.', l: 1 },
    { t: 'Who compiled Sahih Muslim?', o: ['Muslim ibn al-Hajjaj', 'Ibn Majah', 'Al-Nasa’i', 'Malik ibn Anas'], c: 0, e: 'Imam Muslim ibn al-Hajjaj compiled Sahih Muslim.', l: 2 },
    { t: 'How many books make up the well-known “Six Books” (Kutub al-Sittah)?', o: ['Four', 'Five', 'Six', 'Seven'], c: 2, e: 'The name itself means “the six books”.', l: 3 },
    { t: 'Sahih al-Bukhari opens with the hadith about what?', o: ['Prayer times', 'Actions being judged by intentions', 'The five pillars', 'Kindness to neighbours'], c: 1, e: 'It opens with “Actions are judged by intentions”.', l: 3 },
    { t: 'In the Hadith of Jibril, which three matters is the Prophet ﷺ asked about?', o: ['Islam, Iman, Ihsan', 'Salah, Zakat, Hajj', 'Tawhid, Fiqh, Tafsir', 'Past, present, future'], c: 0, e: 'Jibril asked about Islam, Iman and Ihsan.', l: 4 },
    { t: 'Which companion is known for narrating the largest number of hadith?', o: ['Abu Hurairah', 'Abu Bakr', 'Bilal ibn Rabah', 'Khalid ibn al-Walid'], c: 0, e: 'Abu Hurairah narrated the most reports.', l: 2 },
    { t: 'Who compiled the early collection called Al-Muwatta?', o: ['Imam Malik', 'Imam al-Shafi‘i', 'Imam Ahmad', 'Imam Abu Hanifa'], c: 0, e: 'Imam Malik ibn Anas compiled Al-Muwatta.', l: 3 },
    { t: 'The hadith “Islam is built upon five” is narrated by which companion?', o: ['Abdullah ibn Umar', 'Anas ibn Malik', 'Aisha', 'Ali ibn Abi Talib'], c: 0, e: 'It is narrated by Abdullah ibn Umar.', l: 5 },
  ],
  seerah: [
    { t: 'In which city was the Prophet Muhammad ﷺ born?', o: ['Madinah', 'Makkah', 'Taif', 'Jerusalem'], c: 1, e: 'He was born in Makkah.', l: 1 },
    { t: 'To which city did the Prophet ﷺ and his companions migrate in the Hijrah?', o: ['Taif', 'Damascus', 'Madinah', 'Jeddah'], c: 2, e: 'The Hijrah was to Yathrib, later called Madinah.', l: 1 },
    { t: 'Who was the first wife of the Prophet ﷺ?', o: ['Aisha', 'Khadijah', 'Hafsah', 'Zaynab'], c: 1, e: 'Khadijah bint Khuwaylid was his first wife.', l: 1 },
    { t: 'Which was the first major battle between the Muslims and the Quraysh, in 2 AH?', o: ['Uhud', 'Badr', 'Khandaq', 'Hunayn'], c: 1, e: 'The Battle of Badr took place in 2 AH.', l: 2 },
    { t: 'In which cave did the first revelation come to the Prophet ﷺ?', o: ['Cave of Thawr', 'Cave of Hira', 'Cave of Kahf', 'Cave of Uhud'], c: 1, e: 'Revelation first came in the Cave of Hira.', l: 2 },
    { t: 'Which treaty in 6 AH was agreed between the Muslims and the Quraysh?', o: ['Treaty of Hudaybiyyah', 'Pledge of Aqabah', 'Treaty of Najran', 'Charter of Madinah'], c: 0, e: 'The Treaty of Hudaybiyyah was agreed in 6 AH.', l: 3 },
    { t: 'Which caliph introduced the Hijri calendar?', o: ['Abu Bakr', 'Umar ibn al-Khattab', 'Uthman ibn Affan', 'Ali ibn Abi Talib'], c: 1, e: 'Umar ibn al-Khattab established the Hijri calendar.', l: 4 },
    { t: 'Which mosque was built on the outskirts of Madinah as the Prophet ﷺ arrived?', o: ['Quba Mosque', 'Mosque of the Two Qiblas', 'Al-Aqsa Mosque', 'Mosque of Uhud'], c: 0, e: 'Quba Mosque was the first mosque built on arrival.', l: 4 },
  ],
  prophets: [
    { t: 'Which prophet built the Ark?', o: ['Nuh', 'Ibrahim', 'Musa', 'Isa'], c: 0, e: 'Nuh (Noah) built the Ark.', l: 1 },
    { t: 'Which prophet was swallowed by a great fish?', o: ['Yunus', 'Ayyub', 'Yusuf', 'Zakariyya'], c: 0, e: 'Yunus (Jonah) was swallowed by a fish.', l: 1 },
    { t: 'Which prophet was cast into a fire that became cool and safe?', o: ['Ibrahim', 'Musa', 'Dawud', 'Hud'], c: 0, e: 'Ibrahim (Abraham) was saved from the fire.', l: 2, r: 'Qur’an 21:69' },
    { t: 'Which prophet was given the Zabur (Psalms)?', o: ['Musa', 'Dawud', 'Isa', 'Sulayman'], c: 1, e: 'Dawud (David) was given the Zabur.', l: 2 },
    { t: 'Which prophet was given the Tawrat (Torah)?', o: ['Musa', 'Ibrahim', 'Yahya', 'Salih'], c: 0, e: 'Musa (Moses) was given the Tawrat.', l: 1 },
    { t: 'Which prophet was given authority over the wind and could understand the speech of birds?', o: ['Sulayman', 'Idris', 'Ilyas', 'Lut'], c: 0, e: 'This is mentioned of Sulayman (Solomon).', l: 3 },
    { t: 'Which prophet is known for his great patience in illness?', o: ['Ayyub', 'Harun', 'Ishaq', 'Shu‘ayb'], c: 0, e: 'Ayyub (Job) is the example of patience.', l: 3 },
    { t: 'To which people was the Prophet Hud sent?', o: ['Thamud', 'Ad', 'Madyan', 'Saba'], c: 1, e: 'Hud was sent to the people of ‘Ad.', l: 5 },
  ],
  history: [
    { t: 'Who was the first caliph after the Prophet ﷺ?', o: ['Umar', 'Uthman', 'Abu Bakr', 'Ali'], c: 2, e: 'Abu Bakr as-Siddiq became the first caliph.', l: 1 },
    { t: 'Who was the fourth of the Rightly Guided Caliphs?', o: ['Ali ibn Abi Talib', 'Umar', 'Uthman', 'Abu Bakr'], c: 0, e: 'Ali ibn Abi Talib was the fourth.', l: 2 },
    { t: 'Which dynasty followed the Rightly Guided Caliphs?', o: ['Abbasid', 'Umayyad', 'Fatimid', 'Ottoman'], c: 1, e: 'The Umayyad caliphate followed.', l: 3 },
    { t: 'Which Abbasid caliph founded Baghdad in 762 CE?', o: ['Al-Mansur', 'Harun al-Rashid', 'Al-Ma’mun', 'Al-Mutawakkil'], c: 0, e: 'Al-Mansur founded the city.', l: 5 },
    { t: 'Who conquered Constantinople in 1453?', o: ['Mehmed II', 'Suleiman I', 'Selim I', 'Murad II'], c: 0, e: 'Sultan Mehmed II took the city in 1453.', l: 4 },
    { t: 'Under which caliph was the Dome of the Rock completed (691 CE)?', o: ['Abd al-Malik', 'Al-Walid I', 'Mu‘awiyah', 'Umar II'], c: 0, e: 'Abd al-Malik ibn Marwan completed it.', l: 6 },
    { t: 'Who wrote the Muqaddimah?', o: ['Ibn Khaldun', 'Ibn Rushd', 'Ibn Battuta', 'Al-Biruni'], c: 0, e: 'Ibn Khaldun wrote the Muqaddimah.', l: 4 },
    { t: 'Who led the Muslim forces at the Battle of Hattin in 1187?', o: ['Salah ad-Din', 'Baybars', 'Nur ad-Din', 'Tariq ibn Ziyad'], c: 0, e: 'Salah ad-Din al-Ayyubi led them.', l: 4 },
  ],
  practices: [
    { t: 'How many obligatory daily prayers are there?', o: ['3', '4', '5', '6'], c: 2, e: 'Muslims pray five obligatory prayers daily.', l: 1 },
    { t: 'In which month do Muslims fast from dawn to sunset?', o: ['Shawwal', 'Ramadan', 'Dhul Hijjah', 'Rabi al-Awwal'], c: 1, e: 'Fasting is in Ramadan.', l: 1 },
    { t: 'What proportion of qualifying savings is the usual rate of Zakat?', o: ['1%', '2.5%', '5%', '10%'], c: 1, e: 'The usual rate is 2.5% of qualifying wealth.', l: 3 },
    { t: 'Towards what do Muslims face in prayer?', o: ['Madinah', 'The Kaaba in Makkah', 'Jerusalem', 'The East'], c: 1, e: 'The Qiblah is the Kaaba.', l: 1 },
    { t: 'Which prayer is offered just after sunset?', o: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib'], c: 3, e: 'Maghrib is prayed after sunset.', l: 1 },
    { t: 'On which day of the week is the congregational Jumu‘ah prayer held?', o: ['Thursday', 'Friday', 'Saturday', 'Sunday'], c: 1, e: 'Jumu‘ah is on Friday.', l: 1 },
    { t: 'How many rak‘ahs are in the obligatory Fajr prayer?', o: ['2', '3', '4', '5'], c: 0, e: 'Fajr has two obligatory rak‘ahs.', l: 2 },
    { t: 'On which date of Dhul Hijjah do pilgrims stand at ‘Arafah?', o: ['8th', '9th', '10th', '12th'], c: 1, e: 'The Day of ‘Arafah is the 9th of Dhul Hijjah.', l: 4 },
  ],
};
