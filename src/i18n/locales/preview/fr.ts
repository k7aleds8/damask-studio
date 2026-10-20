import type { preview as en } from './en';

// French puts a narrow no-break space (U+202F) before : ; ? ! and inside guillemets
export const preview: typeof en = {
  show: 'Aperçu',
  close: 'Fermer',
  now: 'Maintenant',
  after: 'Après',
  on: 'Activé',
  off: 'Désactivé',
  setting: 'Aperçus des options',
  settingDesc: 'Une courte animation montre ce qui change avant même que vous touchiez à une option.',
  scenes: {
    mod: {
      home: 'Votre note d’accueil devient un tableau de bord : salutation, horloge, chiffres du coffre et journée en un coup d’œil.',
      inserter: 'Ajoute « Insérer un bloc » au menu de l’éditeur, avec la galerie de blocs et ses raccourcis.',
      embeds: 'Met en page dessins et images — alignement, largeur, cadre — avec une barre d’outils au survol.',
      folders: 'Colore chaque dossier principal et tout ce qu’il contient, avec des repères le long de l’arborescence.',
      headings: 'Chaque niveau de titre reçoit sa couleur et son style, dans toutes vos notes.',
      variants: 'Choisissez la palette du thème, en mode sombre comme en mode clair, directement ici.',
      pomodoro: 'Ajoute un minuteur de concentration : un bouton dans le ruban, un panneau latéral et un compte à rebours dans la barre d’état.',
      health: 'Repère liens cassés, notes vides et fichiers égarés, et propose de les corriger en un clic.',
      ticktick: 'Activé, les statistiques de tâches et de concentration viennent de TickTick. Désactivé, elles sont tirées de vos notes.',
    },
    ins: {
      menu: 'Un clic droit dans une note, et « Insérer un bloc » vous attend dans le menu.',
      suggest: 'Tapez ;; n’importe où dans une ligne pour choisir un bloc sans lâcher le clavier.',
      ribbon: 'Un bouton de galerie dans le ruban, à un clic de n’importe quelle note.',
    },
    emb: {
      enabled: 'Applique votre mise en page par défaut à chaque dessin. Désactivé, Obsidian les affiche tels quels.',
      toolbar: 'Une petite barre de mise en page apparaît quand vous survolez un dessin ou une image.',
      trigger: 'La barre apparaît au simple survol, ou seulement en maintenant Alt.',
      images: 'La même mise en page pour les images ordinaires, et pas seulement pour les dessins Excalidraw.',
      align: 'La place du dessin d’un bord à l’autre de la page.',
      width: 'La part de la largeur de page qu’il occupe ; auto garde sa taille d’origine.',
      maxWidth: 'Un plafond de largeur, pour que les grands dessins cessent de s’étirer sur les grands écrans.',
      frame: 'Le cadre tracé autour du dessin.',
      shadow: 'Une ombre douce qui détache le dessin de la page.',
      invert: 'Inverse les couleurs d’un dessin clair pour qu’il se fonde dans une page sombre.',
    },
  },
};
