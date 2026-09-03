# 📌 Full de Ruta de Millores — XIVARRI Web & Dashboard

Document d'especificació de tasques per al repositori **XIVARRI** (Next.js App Router, Tailwind CSS, Cloudflare D1/R2).

---

## 1. Imatge de Marca & Disseny Global (Branding)

### 1.1. Logotip Principal i Tipografia (Segons `image.png`)
- **Text superior:** Afegir el claim *"FAREM MOLT"* inclinat cap a l'esquerra damunt de la primera part del logo, utilitzant una tipografia d'estil handwritten/marcador (ex: `Permanent Marker`, `Caveat` o similar de Google Fonts).
- **Logotip "XIVARRI":**
  - **"XIV":** Color vermell corporatiu vibrant (`#FF1E27` o similar segons la referència visual) amb serif clàssica tipus *Didot*, *Playfair Display* o *Bodoni*.
  - **"ARRI":** Mateixa tipografia serif però en color negre sòlid (`#000000`).
- **Subtítol inferior:** *"14 promoció de Medicina de la UdG"* en tipografia serif/humanista estilitzada, centrat a sota del logo.
- **Fons corporatiu:** Aplicar o respectar el fons beix/crema suau (`#F4EFEB` / `#F5ECE1`) en els elements de capçalera o branding.

### 1.2. Enllaç Directe a Instagram a la Capçalera
- A la capçalera (Header/Navbar), a la zona del logo o al costat del títol principal "XIVARRI", afegir una icona d'Instagram o accés directe que enllaci a:
  - **URL:** `https://www.instagram.com/xivarriudg/`
  - **Atributs:** `target="_blank"` i `rel="noopener noreferrer"`.
  - Disseny subtil i accessible des de dispositius mòbils i escriptori.

---

## 2. Experiència d'Usuari (UI/UX) — Menú de Navegació

### 2.1. Indicador Dinàmic ("Rodona Vermella" / Bubble Indicator)
- **Objectiu:** A la barra de navegació entre departaments/seccions (*Activitats*, *Festes*, *Merch*), implementar una transició fluida de l'indicador vermell.
- **Comportament:**
  - En passar el cursor (`hover`) damunt d'un dels botons, la rodona/indicador vermell s'ha de desplaçar visualment o posicionar-se sobre el botó actiu/enfocat.
  - Implementar-ho mitjançant Tailwind CSS transitions o mitjançant `framer-motion` (amb `layoutId="nav-indicator"`) per aconseguir un efecte elàstic i suau entre botons.

---

## 3. Gestió d'Activitats (Admin Dashboard & Model de Dades)

### 3.1. Galeria de Fotos a les Activitats
- **Model D1 / R2:**
  - Actualitzar l'esquema de la base de dades (D1) per permetre múltiples imatges per activitat (taula `activity_images` o camp JSON `gallery_urls` a `Activity`).
  - Permetre pujar fitxers a Cloudflare R2 des del formulari de creació/edició d'activitats.
- **Frontend / Públic:**
  - Mostrar un carrusel o graella de fotos a la pàgina de detall de l'activitat per mostrar més informació visual del producte o esdeveniment.

### 3.2. Guia / Exemples de Talla (Size Chart / Samples)
- **Merchandising:**
  - A l'apartat de variants de talla (ex: samarretes, dessuadores), afegir un camp o modal d'ajuda: **"Guia de talles"**.
  - Permetre configurar imatges de referència o una taula d'equivalències en centímetres (amplada x llargada) perquè els compradors vegin exemples reals de com queda cada talla abans de pagar.

### 3.3. Arxivar Activitats (Estat "Archived")
- **Base de Dades:**
  - Afegir el camp booleà `archived` (o columna `status: 'draft' | 'published' | 'archived'`) a la taula `Activity`.
- **Admin Dashboard:**
  - Botó ràpid per **"Arxivar activitat"** sense haver d'eliminar les dades històriques ni les comandes (`Order`) associades.
  - Filtre al llistat d'administració: *Actives*, *Borrador*, *Arxivades*.
- **Portal Públic:**
  - Les activitats amb estat `archived = true` queden ocultes del catàleg públic, evitant noves compres però mantenint accessibles les comandes anteriors als usuaris amb tiquet.