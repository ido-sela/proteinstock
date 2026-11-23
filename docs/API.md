# Protein Stock — Store API (v1)

API לחיבור מערכות חיצוניות (מלאי, הנהלת חשבונות, ERP) לחנות פרוטאין סטוק.

- **כתובת בסיס:** `https://proteinstock.co.il/api/v1`
- **אימות:** בכל בקשה שולחים את המפתח בכותרת `x-api-key: <המפתח>` (או `Authorization: Bearer <המפתח>`).
- **פורמט:** JSON, UTF-8. תאריכים בפורמט ISO 8601 (UTC).
- המפתח נותן גישה ל: קריאת הזמנות, קריאת מוצרים ועדכון מלאי. יש לשמור אותו בסוד, בצד השרת בלבד.

## הזמנות

### `GET /orders`
רשימת הזמנות, מהישנה לחדשה.

| פרמטר | תיאור |
|---|---|
| `since` / `until` | הזמנות שנוצרו מ/עד תאריך, למשל `2026-11-01T00:00:00Z` |
| `updated_since` | הזמנות שנוצרו **או שולמו** מאז התאריך (מתאים למשיכה תקופתית) |
| `status` | סטטוס תשלום: `pending,paid,failed,cancelled,refunded` (אפשר כמה, מופרדים בפסיק) |
| `fulfillment_status` | סטטוס משלוח: `pending,processing,shipped,completed,cancelled` |
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

## מוצרים ומלאי

### `GET /products`
כל המוצרים: מזהה, ברקוד (`sku`), שם, מותג, מחיר, מלאי.
פרמטר אופציונלי: `updated_since`.

```json
{ "id": "nho05h", "sku": "5056357999523", "title": "…", "brand": "Snickers", "price": 170,
  "stock": { "tracked": true, "quantity": 82, "low_stock_threshold": 20, "in_stock": true }, "status": "active" }
```

### `GET /products/{id או ברקוד}`
מוצר אחד, לפי מזהה המוצר או לפי הברקוד.

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
