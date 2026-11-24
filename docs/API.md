# Protein Stock — Store API (v1)

API לחיבור מערכות חיצוניות (מלאי, הנהלת חשבונות, ERP) לחנות פרוטאין סטוק.

- **כתובת בסיס:** `https://proteinstock.co.il/api/v1`
- **אימות:** בכל בקשה שולחים את המפתח בכותרת `x-api-key: <המפתח>` (או `Authorization: Bearer <המפתח>`).
- **פורמט:** JSON, UTF-8. תאריכים בפורמט ISO 8601 (UTC).
- **הרשאות:** לכל מפתח הרשאות משלו, שנבחרות כשיוצרים אותו בניהול (הגדרות ← מפתחות API): `orders:read` קריאת הזמנות · `orders:write` עדכון מספר משלוח וסטטוס משלוח · `products:read` קריאת מוצרים ומלאי · `stock:write` עדכון מלאי. בקשה בלי ההרשאה המתאימה מקבלת 403.
- יש לשמור את המפתח בסוד, בצד השרת בלבד. כל מפתח אפשר לבטל בנפרד.
- `GET /` מחזיר את ההרשאות של המפתח ואת רשימת הכתובות.

## הזמנות

### `GET /orders`
רשימת הזמנות, מהישנה לחדשה.

| פרמטר | תיאור |
|---|---|
| `since` / `until` | הזמנות שנוצרו מ/עד תאריך, למשל `2026-11-01T00:00:00Z` |
| `updated_since` | הזמנות שנוצרו **או שולמו** מאז התאריך (מתאים למשיכה תקופתית) |
| `status` | סטטוס תשלום: `pending,paid,failed,cancelled,refunded` (אפשר כמה, מופרדים בפסיק) |
| `fulfillment_status` | סטטוס משלוח: `pending,processing,shipped,completed,cancelled` |
| `phone` | הזמנות של לקוח לפי טלפון. מתאים לפי 9 הספרות האחרונות, כך ש-`0501234567`, `050-1234567` ו-`+972501234567` זהים. עם `phone` ההזמנות מהחדשה לישנה |
| `limit` / `page` | עד 500 בעמוד (ברירת מחדל 100), עמודים מ-0 |

```bash
curl -H "x-api-key: $KEY" "https://proteinstock.co.il/api/v1/orders?status=paid&since=2026-11-01T00:00:00Z"
```

תשובה (מקוצר):
```json
{
  "orders": [{
    "number": "PS7K2Q9M",
    "created_at": "2026-11-23T10:15:00Z",
    "payment_status": "paid",
    "fulfillment_status": "processing",
    "customer": { "name": "…", "phone": "…", "email": "…" },
    "delivery": { "method": "shipping", "shipping_method": "…", "address": "…", "tracking_number": null, "notes": null },
    "totals": { "currency": "ILS", "subtotal": 340, "discount": 34, "coupon_code": "WELCOME10", "shipping": 0, "total": 306 },
    "payment": { "provider": "payplus", "reference": "…", "paid_at": "…" },
    "items": [{ "product_id": "nho05h", "sku": "5056357999523", "title": "…", "quantity": 2, "unit_price": 170, "line_total": 340 }]
  }],
  "page": 0, "limit": 100, "total": 30
}
```

### `GET /orders/{number}`
הזמנה אחת לפי מספר ההזמנה.

```bash
curl -H "x-api-key: $KEY" "https://proteinstock.co.il/api/v1/orders?phone=0501234567&limit=5"
```

### `PATCH /orders/{number}` (הרשאה `orders:write`)
עדכון מספר משלוח וסטטוס משלוח, למשל ברגע שהחבילה נמסרת לחברת השליחויות:
- `tracking_number`: מספר המשלוח (3-80 תווים), או `null` כדי למחוק
- `fulfillment_status`: `pending` / `processing` / `shipped` / `completed` / `cancelled`. אם שולחים מספר משלוח בלי סטטוס, הסטטוס עובר ל-`shipped`
- `shipping_method`: חברת השליחויות או שיטת המשלוח (טקסט חופשי)

```bash
curl -X PATCH -H "x-api-key: $KEY" -H "content-type: application/json" \n  -d '{"tracking_number":"YG123456789","shipping_method":"ישג\"ב"}' "https://proteinstock.co.il/api/v1/orders/PS7K2Q9M"
```
מספר המשלוח מופיע ללקוח בחשבון שלו באתר, ובניהול בעמוד ההזמנה. אפשר למלא אותו גם ידנית בניהול.

## מוצרים ומלאי

### `GET /products`
כל המוצרים: מזהה, ברקוד (`sku`), שם, מותג, מחיר, מלאי.
פרמטר אופציונלי: `updated_since`.

```json
{ "id": "nho05h", "sku": "5056357999523", "title": "…", "brand": "Snickers", "price": 170,
  "stock": { "tracked": true, "quantity": 82, "low_stock_threshold": 20, "in_stock": true }, "status": "active" }
```

### `GET /products/{id או ברקוד}`
מוצר אחד, לפי מזהה המוצר או לפי הברקוד. ברקוד מזוהה גם עם או בלי אפס בהתחלה (למשל `70847899617` = `070847899617`).

### `PATCH /products/{id או ברקוד}`
עדכון מלאי של מוצר אחד. שולחים אחד מהבאים:
- `quantity` — הכמות המדויקת במלאי (מחליף את הקיים)
- `delta` — שינוי יחסי (למשל `-3` או `+24`)
- `low_stock_threshold` — סף התראה על מלאי נמוך (או `null`)

```bash
curl -X PATCH -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"quantity": 120}' "https://proteinstock.co.il/api/v1/products/5056357999523"
```
כמות 0 מסמנת את המוצר "אזל" באתר; כמות גדולה מ-0 מחזירה אותו למכירה.

### `POST /stock`
עדכון מלאי למספר מוצרים בבת אחת (עד 500):
```bash
curl -X POST -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"items":[{"sku":"5056357999523","quantity":120},{"sku":"5060424705467","delta":-2}]}' \
  "https://proteinstock.co.il/api/v1/stock"
```
התשובה מפרטת לכל שורה אם עודכנה (`ok`) או למה לא.

## Webhook: הזמנה ששולמה נשלחת אליכם אוטומטית
ברגע שהתשלום עובר, האתר שולח `POST` עם JSON לכתובת שהוגדרה בניהול (הגדרות ← חיבור למערכת המלאי והמשלוחים). כך מקבלים מיד את כל מה שצריך כדי להעביר לחברת השליחויות, בלי למשוך.

כותרות:
| כותרת | ערך |
|---|---|
| `X-ProteinStock-Event` | `order.paid` |
| `X-ProteinStock-Signature` | `sha256=<hex>` — HMAC-SHA256 של **גוף הבקשה כפי שהתקבל**, עם מפתח החתימה שמופיע בניהול |
| `X-ProteinStock-Timestamp` | זמן השליחה (שניות, Unix) |
| `X-ProteinStock-Delivery` | מזהה ייחודי לשליחה |

גוף הבקשה:
```json
{
  "event": "order.paid",
  "test": false,
  "sent_at": "2026-11-24T10:15:03Z",
  "order": {
    "number": "PS7K2Q9M",
    "created_at": "2026-11-24T10:12:40Z",
    "paid_at": "2026-11-24T10:15:01Z",
    "payment_status": "paid",
    "fulfillment_status": "pending",
    "customer": { "name": "ישראל ישראלי", "phone": "0501234567", "email": "israel@example.com" },
    "delivery": { "method": "shipping", "method_label": "משלוח", "address": "הרצל 10, דירה 4, תל אביב", "notes": "להשאיר ליד הדלת", "shipping_method": null, "tracking_number": null },
    "items": [{ "product_id": "nho05h", "sku": "5056357999523", "title": "…", "quantity": 2, "unit_price": 170, "line_total": 340 }],
    "totals": { "currency": "ILS", "subtotal": 340, "discount": 34, "coupon_code": "WELCOME10", "shipping": 0, "total": 306 },
    "payment": { "provider": "payplus", "reference": "…", "paid_at": "2026-11-24T10:15:01Z" }
  }
}
```
- **איסוף עצמי:** `delivery.method` = `"pickup"` (`method_label` = "איסוף עצמי") ו-`address` = `null`. במשלוח: `"shipping"` עם הכתובת המלאה.
- יש להחזיר קוד 2xx. בשגיאת שרת (5xx / אין תשובה) האתר מנסה שוב עד 3 פעמים; כל שליחה נרשמת בניהול ואפשר לשלוח מחדש בלחיצה.
- אותם נתונים זמינים גם במשיכה: `GET /orders/{number}` או `GET /orders?status=paid&updated_since=…`.

בדיקת החתימה (Node.js):
```js
import crypto from 'node:crypto';
const raw = await req.text();   // הגוף הגולמי, לפני JSON.parse
const expected = 'sha256=' + crypto.createHmac('sha256', process.env.PROTEINSTOCK_SECRET).update(raw).digest('hex');
const got = req.headers.get('x-proteinstock-signature') || '';
if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return new Response('bad signature', { status: 401 });
const { event, order } = JSON.parse(raw);
```

## שגיאות
| קוד | משמעות |
|---|---|
| 401 `missing_key` / `invalid_key` | אין מפתח, או שהמפתח שגוי או בוטל |
| 403 `forbidden` | למפתח אין הרשאה לפעולה |
| 404 `not_found` | ההזמנה או המוצר לא נמצאו |
| 409 `ambiguous_sku` | כמה מוצרים עם אותו ברקוד — יש להשתמש במזהה המוצר |
| 400 `bad_request` | נתונים לא תקינים (למשל כמות שלילית) |

## הערות
- כל הזמנה באתר מורידה את הכמויות מהמלאי אוטומטית, וביטול מחזיר אותן. כדי לסנכרן מלאי, מומלץ למשוך הזמנות חדשות עם `updated_since` ולעדכן מלאי עם `POST /stock`.
- המפתח ניתן לביטול בכל רגע ע"י מנהל החנות.
