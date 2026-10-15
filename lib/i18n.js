// Server tomonidagi ko'p tillilik: o'zbek (asosiy), rus, qoraqalpoq
// Kalit sifatida o'zbekcha matn ishlatiladi, shuning uchun tarjima topilmasa o'zbekcha ko'rinadi.
const { parseCookies } = require('./http');

const LANGS = ['uz', 'ru', 'kaa'];
const DEFAULT = 'uz';

// [ruscha, qoraqalpoqcha]
const M = {
  // --- Umumiy va xatolar ---
  "Bunday API manzil yo'q": ['Такого адреса API нет', 'Bunday API mánzil joq'],
  "Bu metod qo'llab-quvvatlanmaydi": ['Этот метод не поддерживается', 'Bul metod qollap-quwatlanbaydı'],
  "So'rov JSON formatida bo'lishi kerak": ['Запрос должен быть в формате JSON', 'Soraw JSON formatında bolıwı kerek'],
  "Boshqa saytdan yuborilgan so'rov rad etildi": ['Запрос с другого сайта отклонён', 'Basqa sayttan jiberilgen soraw biykarlandı'],
  'Davom etish uchun tizimga kiring': ['Войдите в систему, чтобы продолжить', 'Dawam etiw ushın sistemaǵa kiriń'],
  "Bu bo'lim sizning rolingiz uchun yopiq": ['Этот раздел недоступен для вашей роли', 'Bul bólim sizdiń rolińiz ushın jabıq'],
  "Bunday yozuv allaqachon mavjud": ['Такая запись уже существует', 'Bunday jazıw álleqashan bar'],
  "Serverda kutilmagan xatolik. Birozdan keyin qayta urinib ko'ring": ['Непредвиденная ошибка сервера. Повторите попытку позже', 'Serverde kútilmegen qátelik. Azdan soń qayta urınıp kóriń'],
  "Noto'g'ri JSON formati": ['Неверный формат JSON', 'JSON formatı nadurıs'],
  "So'rov hajmi juda katta": ['Слишком большой запрос', 'Soraw kólemi júdá úlken'],
  "Ruxsat yo'q": ['Нет доступа', 'Ruqsat joq'],

  // --- Kirish va profil ---
  "Bu email bilan hisob allaqachon mavjud. Kirish sahifasidan foydalaning": ['Аккаунт с этим email уже существует. Воспользуйтесь страницей входа', 'Bul email menen akkaunt álleqashan bar. Kiriw betinen paydalanıń'],
  "Email manzili noto'g'ri": ['Неверный адрес email', 'Email mánzili nadurıs'],
  "Email yoki parol noto'g'ri": ['Неверный email или пароль', 'Email yamasa parol nadurıs'],
  'Hisobingiz bloklangan. Administratorga murojaat qiling': ['Ваш аккаунт заблокирован. Обратитесь к администратору', 'Akkauntıńız bloklanǵan. Administratorǵa múrájat etiń'],
  "Joriy parol noto'g'ri": ['Текущий пароль неверен', 'Házirgi parol nadurıs'],
  'Parol juda uzun': ['Пароль слишком длинный', 'Parol júdá uzın'],
  "Parol kamida 8 ta belgidan iborat bo'lsin": ['Пароль должен содержать не менее 8 символов', 'Parol keminde 8 belgiden ibarat bolsın'],
  "Parolda kamida bitta harf va bitta raqam bo'lsin": ['Пароль должен содержать хотя бы одну букву и одну цифру', 'Parolda keminde bir hárip hám bir san bolsın'],
  "Juda ko'p muvaffaqiyatsiz urinish. {min} daqiqadan keyin qayta urinib ko'ring": ['Слишком много неудачных попыток. Повторите через {min} мин.', 'Júdá kóp sátsiz urınıs. {min} minuttan keyin qayta urınıp kóriń'],
  "Juda ko'p urinish. {min} daqiqadan keyin qayta urinib ko'ring": ['Слишком много попыток. Повторите через {min} мин.', 'Júdá kóp urınıs. {min} minuttan keyin qayta urınıp kóriń'],
  "Juda ko'p so'rov. Bir daqiqadan keyin davom eting": ['Слишком много запросов. Продолжите через минуту', 'Júdá kóp soraw. Bir minuttan keyin dawam etiń'],

  // --- Imtihon ---
  'Fan topilmadi': ['Предмет не найден', 'Pán tabılmadı'],
  'Test topilmadi': ['Тест не найден', 'Test tabılmadı'],
  'Test topilmadi yoki yopilgan': ['Тест не найден или закрыт', 'Test tabılmadı yamasa jabılǵan'],
  'Savol topilmadi': ['Вопрос не найден', 'Soraw tabılmadı'],
  'Urinish topilmadi': ['Попытка не найдена', 'Urınıs tabılmadı'],
  'Urinish hali yakunlanmagan': ['Попытка ещё не завершена', 'Urınıs ele juwmaqlanbaǵan'],
  "Test yakunlangan, javobni o'zgartirib bo'lmaydi": ['Тест завершён, ответ изменить нельзя', 'Test juwmaqlanǵan, juwaptı ózgertiw múmkin emes'],
  'Vaqt tugadi': ['Время истекло', 'Waqıt tawsıldı'],
  "Noto'g'ri variant": ['Неверный вариант', 'Nadurıs variant'],
  "Noma'lum qoidabuzarlik turi": ['Неизвестный тип нарушения', 'Belgisiz qaǵıyda buzıw túri'],
  "Bu testda hali savollar yo'q. O'qituvchiga xabar bering": ['В этом тесте пока нет вопросов. Сообщите преподавателю', 'Bul testte ele sorawlar joq. Oqıtıwshıǵa xabar beriń'],
  'Bu test uchun urinishlar soni tugagan ({n} ta)': ['Лимит попыток для этого теста исчерпан ({n})', 'Bul test ushın urınıslar sanı tawsılǵan ({n})'],

  // --- Boshqaruv ---
  'Foydalanuvchi topilmadi': ['Пользователь не найден', 'Paydalanıwshı tabılmadı'],
  "Noto'g'ri rol": ['Неверная роль', 'Nadurıs rol'],
  "O'z rolingiz yoki holatingizni o'zgartira olmaysiz": ['Нельзя изменить собственную роль или статус', 'Óz rolińizdi yamasa jaǵdayıńızdı ózgerte almaysız'],
  "O'zingizni o'chira olmaysiz": ['Нельзя удалить самого себя', 'Ózińizdi óshire almaysız'],
  'Bunday qisqa nomli fan mavjud': ['Предмет с таким коротким именем уже существует', 'Bunday qısqa atlı pán bar'],
  "Qisqa nom faqat lotin harflari va raqamlardan iborat bo'lsin": ['Короткое имя должно состоять только из латинских букв и цифр', 'Qısqa at tek latın háripleri hám sanlardan ibarat bolsın'],
  "Bu savol talabalar natijalarida ishlatilgan. O'chirish o'rniga arxivlang": ['Этот вопрос используется в результатах студентов. Вместо удаления отправьте его в архив', 'Bul soraw studentlerdiń nátiyjelerinde qollanılǵan. Óshiriwdiń ornına arxivleń'],
  "Import uchun matn bo'sh": ['Текст для импорта пуст', 'Import ushın tekst bos'],
  'Bir martada 500 tagacha savol import qilish mumkin': ['За один раз можно импортировать до 500 вопросов', 'Bir mártede 500 ge shekem soraw import qılıw múmkin'],
  '{n}-blok: "{line}" qatori +, -, ? yoki ! bilan boshlanishi kerak': ['Блок {n}: строка «{line}» должна начинаться с +, -, ? или !', '{n}-blok: "{line}" qatarı +, -, ? yamasa ! belgisi menen baslanıwı kerek'],
  "{n}-blok: to'g'ri javob \"+\" bilan belgilanmagan": ['Блок {n}: правильный ответ не отмечен знаком «+»', '{n}-blok: durıs juwap "+" belgisi menen belgilenbegen'],
  "{n}-blok: tarjima variantlari soni asosiy variantlarga teng emas": ['Блок {n}: количество вариантов перевода не совпадает с основными', '{n}-blok: awdarma variantları sanı tiykarǵı variantlarǵa teń emes'],

  // --- Tekshiruv shablonlari ---
  "{name}: kamida {min} ta belgi kiriting": ['{name}: введите не менее {min} символов', '{name}: keminde {min} belgi kiritiń'],
  '{name}: {max} belgidan oshmasin': ['{name}: не более {max} символов', '{name}: {max} belgiden aspasın'],
  '{name}: {min} dan {max} gacha butun son kiriting': ['{name}: введите целое число от {min} до {max}', '{name}: {min} den {max} ge shekem pútin san kiritiń'],
  "{label}: 2 tadan 6 tagacha variant bo'lsin": ['{label}: должно быть от 2 до 6 вариантов', '{label}: 2 den 6 ǵa shekem variant bolsın'],
  "{label}: bo'sh variantlarni to'ldiring yoki o'chiring": ['{label}: заполните или удалите пустые варианты', '{label}: bos variantlardı toltırıń yamasa óshiriń'],
  '{label}: variant 300 belgidan oshmasin': ['{label}: вариант не должен превышать 300 символов', '{label}: variant 300 belgiden aspasın'],
  '{label}: variantlar takrorlanmasin': ['{label}: варианты не должны повторяться', '{label}: variantlar tákirarlanbasın'],
  "{label}: tarjimada variantlar soni asosiy variantlarga teng bo'lsin": ['{label}: в переводе должно быть столько же вариантов, сколько в основном тексте', '{label}: awdarmada variantlar sanı tiykarǵı variantlarǵa teń bolsın'],

  // --- Maydon nomlari ---
  'Ism familiya': ['Имя и фамилия', 'Atı-familiyası'],
  'Guruh': ['Группа', 'Topar'],
  'Fan nomi': ['Название предмета', 'Pán atı'],
  'Qisqa nom': ['Короткое имя', 'Qısqa at'],
  'Tavsif': ['Описание', 'Táriyp'],
  'Fan': ['Предмет', 'Pán'],
  'Test nomi': ['Название теста', 'Test atı'],
  'Savollar soni': ['Количество вопросов', 'Sorawlar sanı'],
  'Vaqt': ['Время', 'Waqıt'],
  'Qiyinlik': ['Сложность', 'Qıyınlıq'],
  'Urinishlar soni': ['Количество попыток', 'Urınıslar sanı'],
  'Qoidabuzarlik chegarasi': ['Лимит нарушений', 'Qaǵıyda buzıw shegarası'],
  '{n}-savol': ['Вопрос {n}', '{n}-soraw'],
  '{n}-savol matni': ['Текст вопроса {n}', '{n}-soraw teksti'],
  "{n}-savol to'g'ri javobi": ['Правильный ответ вопроса {n}', '{n}-soraw durıs juwabı'],
  '{n}-savol izohi': ['Пояснение к вопросу {n}', '{n}-soraw túsindirmesi'],
  '{n}-savol qiyinligi': ['Сложность вопроса {n}', '{n}-soraw qıyınlıǵı'],
  '{n}-savol ({lang} tarjima)': ['Вопрос {n} (перевод: {lang})', '{n}-soraw ({lang} awdarma)'],

  // --- Baholar ---
  "A'lo": ['Отлично', 'Ájayıp'],
  'Yaxshi': ['Хорошо', 'Jaqsı'],
  'Qoniqarli': ['Удовлетворительно', 'Qanaatlanarlı'],
  'Qoniqarsiz': ['Неудовлетворительно', 'Qanaatlanarsız'],

  // --- Qoidabuzarlik turlari ---
  "Boshqa oyna yoki ilovaga o'tildi": ['Переход в другое окно или приложение', 'Basqa aynaǵa yamasa qosımshaǵa ótildi'],
  'Test oynasidan chiqildi': ['Выход из окна теста', 'Test aynasınan shıǵıldı'],
  "To'liq ekran rejimidan chiqildi": ['Выход из полноэкранного режима', 'Tolıq ekran rejiminen shıǵıldı'],
  'Nusxa olishga urinildi': ['Попытка копирования', 'Nusqa alıwǵa urınıldı'],
  "Matn qo'yishga urinildi": ['Попытка вставить текст', 'Tekst qoyıwǵa urınıldı'],
  "Sichqonchaning o'ng tugmasi bosildi": ['Нажата правая кнопка мыши', 'Tıshqannıń oń túymesi basıldı'],
  'Dasturchi vositalarini ochishga urinildi': ['Попытка открыть инструменты разработчика', 'Programmist quralların ashıwǵa urınıldı'],
  'Sahifani chop etish yoki saqlashga urinildi': ['Попытка распечатать или сохранить страницу', 'Betti baspaǵa shıǵarıwǵa yamasa saqlawǵa urınıldı'],
  'Ekran rasmini olish tugmasi bosildi': ['Нажата клавиша снимка экрана', 'Ekran súwretin alıw túymesi basıldı'],

  // --- CSV eksport ---
  'Talaba': ['Студент', 'Student'],
  'Test': ['Тест', 'Test'],
  'Ball': ['Балл', 'Ball'],
  'Jami': ['Всего', 'Barlıǵı'],
  'Foiz': ['Процент', 'Procent'],
  'Baho': ['Оценка', 'Baha'],
  'Qoidabuzarlik': ['Нарушения', 'Qaǵıyda buzıw'],
  'Yakunlanish': ['Завершение', 'Juwmaqlanıw'],
  'Boshlangan': ['Начало', 'Baslanǵan'],
  'Yakunlangan': ['Окончание', 'Juwmaqlanǵan'],
  'Davomiyligi (daq)': ['Длительность (мин)', 'Dawamlılıǵı (min)'],
  'Topshirildi': ['Сдан', 'Tapsırıldı'],

  // --- Boshlang'ich testlar ---
  '{name}: umumiy test': ['{name}: общий тест', '{name}: ulıwma test'],
  "{name} fani bo'yicha barcha mavzulardan 20 ta tasodifiy savol.": ['20 случайных вопросов по всем темам предмета «{name}».', '{name} páni boyınsha barlıq temalardan 20 tosınnan soraw.'],
  '{name}: tezkor sinov': ['{name}: быстрая проверка', '{name}: tez sınaw'],
  'Asosiy tushunchalarni tez takrorlash uchun 10 ta oson savol.': ['10 простых вопросов для быстрого повторения основных понятий.', 'Tiykarǵı túsiniklerdi tez tákirarlaw ushın 10 ańsat soraw.'],
  // --- v3 ---
  "Guruh topilmadi": ["Группа не найдена", "Topar tabılmadı"],
  "Bu guruh boshqa o'qituvchiga tegishli": ["Эта группа принадлежит другому преподавателю", "Bul topar basqa oqıtıwshıǵa tiyisli"],
  "Rasm topilmadi": ["Изображение не найдено", "Súwret tabılmadı"],
  "Sertifikat topilmadi": ["Сертификат не найден", "Sertifikat tabılmadı"],
  "Bunday kodli guruh topilmadi. Kodni o'qituvchingizdan tekshiring": ["Группа с таким кодом не найдена. Уточните код у преподавателя", "Bunday kodlı topar tabılmadı. Kodtı oqıtıwshıńızdan tekseriń"],
  "Siz allaqachon bu guruh a'zosisiz": ["Вы уже состоите в этой группе", "Siz álleqashan bul topar aǵzasısız"],
  "Bu email bilan ro'yxatdan o'tgan foydalanuvchi yo'q": ["Пользователь с таким email не зарегистрирован", "Bul email menen dizimnen ótken paydalanıwshı joq"],
  "Bu foydalanuvchi allaqachon guruh a'zosi": ["Этот пользователь уже в группе", "Bul paydalanıwshı álleqashan topar aǵzası"],
  "O'z parolingizni profil sahifasida o'zgartiring": ["Свой пароль меняйте на странице профиля", "Óz parolıńızdı profil betinde ózgertiń"],
  "Faqat o'z guruhingizdagi talabalar parolini tiklay olasiz": ["Можно сбросить пароль только студентам своих групп", "Tek óz toparıńızdaǵı studentlerdiń parolın tiklewińiz múmkin"],
  "Zaxiralash sozlanmagan": ["Резервное копирование не настроено", "Zapaslaw sazlanbaǵan"],
  "Zaxira saqlanmadi: {error}": ["Копия не сохранена: {error}", "Zapas saqlanbadı: {error}"],
  "Guruh nomi": ["Название группы", "Topar atı"],
  "Sana noto'g'ri": ["Неверная дата", "Sáne nadurıs"],
  "Yopilish vaqti ochilish vaqtidan keyin bo'lsin": ["Время закрытия должно быть позже времени открытия", "Jabılıw waqtı ashılıw waqtınan keyin bolsın"],
  "Rasm topilmadi, qayta yuklang": ["Изображение не найдено, загрузите заново", "Súwret tabılmadı, qayta júkleń"],
  "Sertifikat chegarasi": ["Порог сертификата", "Sertifikat shegarası"],
  "Bu test faqat ma'lum guruh a'zolari uchun": ["Этот тест только для участников определённой группы", "Bul test tek belgili topar aǵzaları ushın"],
  "Test hali ochilmagan": ["Тест ещё не открыт", "Test ele ashılmaǵan"],
  "Test topshirish muddati tugagan": ["Срок сдачи теста истёк", "Testti tapsırıw múddeti tamamlanǵan"],
  "Rasm formati noto'g'ri": ["Неверный формат изображения", "Súwret formatı nadurıs"],
  "Rasm hajmi juda katta (1 MB gacha)": ["Изображение слишком большое (до 1 МБ)", "Súwret kólemi júdá úlken (1 MB shekem)"],
  "Faqat PNG, JPEG, WebP yoki GIF rasm yuklash mumkin": ["Можно загрузить только PNG, JPEG, WebP или GIF", "Tek PNG, JPEG, WebP yamasa GIF súwret júklew múmkin"],
};

const IDX = { ru: 0, kaa: 1 };

function fill(str, params) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? params[k] : m));
}

// t('uz' | 'ru' | 'kaa', kalit, parametrlar). Parametr { key, params } bo'lsa, u ham tarjima qilinadi.
function t(lang, key, params = {}) {
  const resolved = {};
  for (const [k, v] of Object.entries(params || {})) {
    resolved[k] = v && typeof v === 'object' && 'key' in v ? t(lang, v.key, v.params) : (typeof v === 'string' && M[v] ? t(lang, v) : v);
  }
  const row = M[key];
  const str = lang !== 'uz' && row ? row[IDX[lang]] : key;
  return fill(str, resolved);
}

function langFrom(req) {
  const h = String(req.headers['x-lang'] || '').toLowerCase();
  if (LANGS.includes(h)) return h;
  const c = String(parseCookies(req).lang || '').toLowerCase();
  return LANGS.includes(c) ? c : DEFAULT;
}

// So'rov davomida joriy til (SQL ichidagi tr() funksiyasi uchun). Ishlovchilar sinxron bo'lgani uchun xavfsiz.
let current = DEFAULT;
const setCurrent = (l) => { current = LANGS.includes(l) ? l : DEFAULT; };
const getCurrent = () => current;

// Bazadagi i18n JSON ustunidan joriy tilga mos qiymatni olish
function pick(i18nJson, field, base, lang = current) {
  if (lang === DEFAULT || !i18nJson) return base;
  try {
    const v = JSON.parse(i18nJson)?.[lang]?.[field];
    if (v === undefined || v === null || v === '') return base;
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch { return base; }
}

module.exports = { LANGS, DEFAULT, t, langFrom, setCurrent, getCurrent, pick, M };
