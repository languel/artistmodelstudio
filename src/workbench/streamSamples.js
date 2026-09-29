/**
 * Clips to stream, by address (nothing is downloaded or kept): early cinema and dance, public domain, from
 * Wikipedia and Commons. Each is a File: page; `start` and `end` (seconds) cut a moment out of a long film
 * (the player's in and out points), so a two-hour film can be used as a ten-second clip. Found by looking
 * through the films; times are the same in every size. Clips cut from a long film ask for the 240p version:
 * these files have no index, so starting at minute 85 reads the film up to there (about 120 MB at 240p, over 400 at 480p).
 */
const W = 'https://en.wikipedia.org/wiki/File:', C = 'https://commons.wikimedia.org/wiki/File:';
export const STREAM_SAMPLES = [
  // Faces and expression
  { group: 'Faces', title: 'Metropolis 1927 · Maria’s wink', page: `${W}Metropolis_(1927).webm`, start: 5123.5, end: 5131.5, quality: '240', quality: '240', note: 'Brigitte Helm, the machine-Maria: a close-up and a wink' },
  { group: 'Faces', title: 'Metropolis 1927 · the machine becomes Maria', page: `${W}Metropolis_(1927).webm`, start: 4964, end: 4987, quality: '240', quality: '240', note: 'The robot’s face turns into Maria’s: eyes closed, then open' },
  { group: 'Faces', title: 'Fred Ott’s Sneeze 1894', page: `${C}Fred_Ott's_Sneeze_(1894).webm`, note: 'Edison: a face, three seconds' },
  { group: 'Faces', title: 'Un homme de têtes 1898', page: `${C}Un_homme_de_tête_(1898).webm`, note: 'Méliès: a man takes off his heads' },
  { group: 'Faces', title: 'L’homme à la tête en caoutchouc 1901', page: `${C}L'homme_à_la_tête_en_caoutchouc_(1901).webm`, note: 'Méliès: a head inflated by a bellows' },
  { group: 'Faces', title: 'Une partie de cartes 1896', page: `${C}1895-lumiere-une-partie-de-cartes.webm`, note: 'Lumière: three men at cards, laughing' },
  { group: 'Faces', title: 'Le Repas de bébé 1895', page: `${C}Le_Repas_(de_bébé)_(1895).webm`, note: 'Lumière: a family at breakfast' },
  // Vertov
  { group: 'Vertov', title: 'Man with a Movie Camera 1929 · the eye in the lens', page: `${C}Man_With_A_Movie_Camera_(Dziga_Vertov,_1929).webm`, start: 820, end: 834, quality: '240', note: 'A woman wakes on a bench, an eye in a lens' },
  { group: 'Vertov', title: 'Man with a Movie Camera 1929 · the editor’s table', page: `${C}Man_With_A_Movie_Camera_(Dziga_Vertov,_1929).webm`, start: 1350, end: 1413, quality: '240', note: 'Faces on film strips, the cutting and the splicing' },
  { group: 'Vertov', title: 'Man with a Movie Camera 1929 · the iris', page: `${C}Man_With_A_Movie_Camera_(Dziga_Vertov,_1929).webm`, start: 708, end: 740, quality: '240', note: 'The lens opens and closes; a woman with a cloth' },
  // Dance
  { group: 'Dance', title: 'Serpentine Dance 1895 (Annabelle)', page: `${C}Serpentine_Dance_(1895)_-_yt.webm`, note: 'Edison: a hand-tinted serpentine dance' },
  { group: 'Dance', title: 'Danse serpentine 1897 (Lumière)', page: `${C}Danse_serpentine_(Lumière,_1897).webm`, note: 'Lumière: a serpentine dance in colour' },
  { group: 'Dance', title: 'Loïe Fuller serpentine dance 1905', page: `${C}Loie-fuller-_serpentine_dans_1905-colored_version.webm`, note: 'The colored version' },
  { group: 'Dance', title: 'Butterfly dance 1895', page: `${C}Butterfly_dance_(1895).webm`, note: 'Annabelle, in colour' },
  { group: 'Dance', title: 'Sandow 1894', page: `${C}Sandow_(1894).webm`, note: 'Edison: the strongman poses' },
  // Edison and Lumière
  { group: 'First films', title: 'Dickson Greeting 1891', page: `${C}Dickson_Greeting_(1891).webm`, note: 'The first film shown to an audience: a man lifts his hat' },
  { group: 'First films', title: 'La Sortie de l’usine Lumière 1895', page: `${C}La_Sortie_de_l'Usine_Lumière_à_Lyon_(le_Premier_Film)_(1895).webm`, note: 'Workers leave the factory' },
  { group: 'First films', title: 'L’Arrivée d’un train à La Ciotat 1895', page: `${C}Arrival_of_a_Train_at_La_Ciotat_(The_Lumière_Brothers,_1895).webm`, note: 'The train comes toward the camera' },
  // Abstract
  { group: 'Abstract', title: 'Lichtspiel Opus II 1922 (Ruttmann)', page: `${C}Lichtspiel_Opus_II_(1922).webm`, note: 'Hand-painted abstract film' },
  { group: 'Abstract', title: 'Lichtspiel Opus III 1924 (Ruttmann)', page: `${C}Lichtspiel_opus_III_(1924).webm`, note: 'Hand-painted abstract film' },
  { group: 'Abstract', title: 'Anemic Cinema 1926 (Duchamp)', page: `${C}Anemic_Cinema.webm`, note: 'Rotoreliefs and puns' },
  // Comedy
  { group: 'Comedy', title: 'Chaplin · Recreation 1914', page: `${C}Recreation_(1914)_-_CHARLIE_CHAPLIN_-_Mack_Sennett.webm`, note: 'Keystone: Chaplin in the park' },
  { group: 'Comedy', title: 'Keaton · The Scarecrow 1920', quality: '240', page: `${C}The_Scarecrow_(Edward_F._Cline_and_Buster_Keaton,_1920).webm`, note: 'Buster Keaton' }
];
