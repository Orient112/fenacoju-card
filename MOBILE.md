# Fenacoju-App — Application Android

L'application mobile **Fenacoju-App** charge automatiquement votre site en ligne :

**https://fenacoju-card.vercel.app**

Chaque mise à jour du site (push GitHub → Vercel) est **immédiatement visible** dans l'app, sans republier sur le Play Store.

---

## Architecture

```text
[Fenacoju-App Android]  →  WebView Capacitor
         ↓
[fenacoju-card.vercel.app]  →  API Render  →  Supabase
```

Mêmes données, mêmes comptes, même interface que le site web.

---

## Prérequis

1. **Node.js** 20+ (déjà installé)
2. **Android Studio** : [developer.android.com/studio](https://developer.android.com/studio)
3. **JDK 17** (inclus avec Android Studio)

---

## Générer / mettre à jour l'app

```powershell
cd "c:\Users\CellCom EJ\Desktop\Fenacoju Card"
npm run mobile:prepare
npm run mobile:open
```

Dans Android Studio :
1. Attendez la fin de la synchronisation Gradle
2. Branchez un téléphone Android (mode développeur + débogage USB) **ou** lancez un émulateur
3. Cliquez **Run** (▶)

---

## Créer un fichier APK (installation directe)

Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**

Le fichier sera dans :
`android/app/build/outputs/apk/debug/app-debug.apk`

Transférez-le sur le téléphone et installez-le.

---

## Icône de l'app

L'icône est générée depuis `public/fenacoju-logo.png` (logo à côté de « FENACOJU Card »).

Pour régénérer les icônes après modification du logo :

```powershell
npm run mobile:icons
npm run mobile:sync
```

---

## Scripts disponibles

| Commande | Description |
|---|---|
| `npm run mobile:icons` | Génère les icônes Android |
| `npm run mobile:sync` | Synchronise la config Capacitor |
| `npm run mobile:open` | Ouvre le projet dans Android Studio |
| `npm run mobile:prepare` | Build + icônes + sync (tout-en-un) |

---

## Publication Play Store (optionnel)

1. Android Studio → **Build → Generate Signed Bundle / APK**
2. Créez une clé de signature (keystore)
3. Choisissez **Android App Bundle (.aab)**
4. Uploadez sur [Google Play Console](https://play.google.com/console)

> Même publiée sur le Play Store, l'app reste connectée au site en ligne et se met à jour automatiquement à chaque déploiement Vercel.

---

## Changer l'URL du site

Modifiez `server.url` dans `capacitor.config.json`, puis :

```powershell
npm run mobile:sync
```

---

## Dépannage

| Problème | Solution |
|---|---|
| Écran blanc au lancement | Vérifiez la connexion Internet et que Vercel est en ligne |
| Login bloqué sur « Connexion... » | Vérifiez que Render API est **Live** |
| Caméra ne fonctionne pas | Autorisez Caméra et Stockage dans les paramètres Android |
| Gradle sync failed | Ouvrez Android Studio et laissez-le télécharger le SDK |
