# Defterdar STK Yönetim - Railway Deploy

## Hazırlanma

```bash
# Dependencies yükle
npm install

# Local çalıştırma
npm start
```

## Railway'e Deploy

### 1. Railway CLI Yükle
```bash
npm i -g @railway/cli
```

### 2. Railway Login
```bash
railway login
```

### 3. Proje İnit
```bash
railway init
```

### 4. PostgreSQL Ekle
Railway dashboard'dan "New" → "Database" → "PostgreSQL" seç

### 5. Push
```bash
git add .
git commit -m "Railway deploy hazırlanması"
git push railway main
```

## Ortam Değişkenleri

Railway otomatik olarak PostgreSQL URL'i `DATABASE_URL` olarak sağlar.

```
DATABASE_URL=postgresql://...  (otomatik)
SESSION_SECRET=your-secret      (manuel ekle)
NODE_ENV=production             (otomatik)
```

## Sorun Giderme

**Session hatası**: PostgreSQL bağlantısını kontrol et
**Port hatası**: Railway PORT'u otomatik atıyor

## İletişim

Sorular için → GitHub Issues
