/* Shared droid/rarity data, extracted verbatim from the tracker's original script.
   Loaded by both tracker.html and overlay.html so they never drift apart. */
const RCOLOR = {B:"var(--r-base)",G:"var(--r-gold)",D:"var(--r-diamond)",R:"rainbow",K:"var(--r-beskar)",X:"var(--r-galactic)",S:"var(--r-stellar)"};
const RNAME = {B:"Base",G:"Gold",D:"Diamond",R:"Rainbow",K:"Beskar",X:"Galactic",S:"Stellar"};
const RCLASS = {B:"rarity-base",G:"rarity-gold",D:"rarity-diamond",R:"rarity-rainbow",K:"rarity-beskar",X:"rarity-galactic",S:"rarity-stellar"};

// each cycle: array of 35 levels, each level = array of 3 [rarityCode, name]
const CYCLES = {
1:[
[["B","Pit"],["B","DRK-1 PROBE"],["B","CB"]],
[["B","Bal-Core"],["B","BDX Explorer"],["B","2BB"]],
[["B","B-U4D"],["B","A-LT"],["G","R9"]],
[["G","ARG"],["B","Groundmech"],["G","B1 Security"]],
[["G","B-U4D"],["G","Hov-R"],["D","R9"]],
[["D","ARG"],["G","Groundmech"],["D","A-LT"]],
[["D","B-U4D"],["D","B1 Security"],["G","BB"]],
[["G","LO"],["D","Hov-R"],["G","Util-Tec"]],
[["R","Groundmech"],["G","Trak-R"],["G","R6"]],
[["R","LO"],["G","Strike-Orb"],["R","Haul-R"]],
[["R","Amp Walker"],["R","B1 Heavy"],["B","BB9"]],
[["B","Mecha Droid"],["B","Mono-Wlkr"],["G","Proto Roller"]],
[["B","B2-RP"],["B","Cyclo-Grav"],["B","R7"]],
[["G","Mecha Droid"],["G","Mono-Wlkr"],["B","Opti-Strk"]],
[["G","B2-RP"],["G","R7"],["G","BB9"]],
[["D","Proto Roller"],["D","Mono-Wlkr"],["G","Opti-Strk"]],
[["D","Mecha Droid"],["D","B2-RP"],["D","Cyclo-Grav"]],
[["R","Mono-Wlkr"],["D","R7"],["D","BB9"]],
[["R","Proto Roller"],["R","B2-RP"],["R","Cyclo-Grav"]],
[["R","Mecha Droid"],["R","Opti-Strk"],["R","R7"]],
[["K","Groundmech"],["K","Orb Walker"],["K","BB"]],
[["K","Amp Walker"],["K","Proto Roller"],["K","B1 Heavy"]],
[["K","Mono Wlkr"],["K","Opti-Strk"],["K","R7"]],
[["K","Cyclo-Grav"],["K","BB9"],["B","Mo-Trak"]],
[["K","B2-RP"],["B","IG"],["G","Drft-R"]],
[["D","Loadlifter"],["R","RIC-1200"],["G","Cyclens"]],
[["K","Snow Mouse"],["D","KX"],["R","Tri-Tek"]],
[["X","Proto Roller"],["R","Mo-Trak"],["K","Drft-R"]],
[["X","Mecha Droid"],["X","Mono-Wlkr"],["K","IG"]],
[["X","Loadlifter"],["X","B2-RP"],["K","Cyclens"]],
[["S","Sen-Tri"],["K","Proto Roller"],["K","KX"]],
[["X","Opti-Pod"],["K","RIC"],["X","Orb Walker"]],
[["S","B1 Heavy"],["X","Cyclo-Grav"],["X","Drft-R"]],
[["S","Groundmech"],["S","BB"],["X","Cyclens"]],
[["S","Snow Mouse"],["S","IG"],["S","BB9"]],
],
2:[
[["B","Gonk"],["B","Mouse"],["B","ID10"]],
[["B","SENATE HOVERCAM"],["B","Roll-R"],["B","Nav-Ex"]],
[["G","BDX Explorer"],["B","Vect-Arm"],["B","R4"]],
[["G","Bal-Core"],["G","2BB"],["B","Orb Walker"]],
[["G","Nav-Ex"],["G","Vect-Arm"],["G","R4"]],
[["D","Bal-Core"],["B","Gunrunner"],["D","2BB"]],
[["D","BDX Explorer"],["D","Roll-R"],["G","R2"]],
[["G","Gunrunner"],["G","B2 Super"],["D","R4"]],
[["G","Amp Walker"],["R","Nav-Ex"],["G","Strike-Orb"]],
[["R","Vect-Arm"],["D","B2 Super"],["D","R2"]],
[["R","Bal-Core"],["D","Strike-Orb"],["D","B2 Heavy"]],
[["R","R2"],["R","Orb Walker"],["B","BB9"]],
[["B","Proto Roller"],["B","Mecha Droid"],["R","B2 Super"]],
[["R","B2 Heavy"],["B","B2-RP"],["G","R7"]],
[["G","Proto Roller"],["R","Strike-Orb"],["G","BB9"]],
[["R","Amp Walker"],["G","Mecha Droid"],["D","B2-RP"]],
[["R","Opti-Pod"],["G","Mono-Wlkr"],["D","R7"]],
[["D","Proto Roller"],["R","Util-Tec"],["D","BB9"]],
[["D","Mecha Droid"],["R","B2-RP"],["R","R7"]],
[["R","Mono-Wlkr"],["R","Opti-Strk"],["R","Cyclo-Grav"]],
[["K","LO"],["K","Haul-R"],["K","R6"]],
[["K","Sen-Tri"],["K","Proto Roller"],["K","Strike-Orb"]],
[["K","B2-RP"],["K","Cyclo-Grav"],["K","BB9"]],
[["B","Snow Mouse"],["K","B2-RP"],["K","Opti-Strk"]],
[["K","Mono-Wlkr"],["B","RIC-1200"],["G","Tri-Tek"]],
[["G","KX"],["R","IG"],["D","Drft-R"]],
[["D","LEP"],["R","Loadlifter"],["K","Mo-Trak"]],
[["X","Mecha Droid"],["R","Snow Mouse"],["K","Tri-Tek"]],
[["K","RIC"],["X","Cyclo-Grav"],["X","R7"]],
[["X","Opti-Strk"],["K","KX"],["X","Drft-R"]],
[["K","Loadlifter"],["S","B2 Super"],["K","B2-RP"]],
[["X","Gunrunner"],["K","LEP"],["X","B1 Heavy"]],
[["X","Opti-Strk"],["X","KX"],["S","R2"]],
[["S","LO"],["X","RIC"],["S","R6"]],
[["S","R7"],["S","Drft-R"],["S","Cyclens"]],
],
3:[
[["B","Pit"],["B","Mouse"],["B","Gonk"]],
[["B","SENATE HOVERCAM"],["B","R3"],["B","2BB"]],
[["B","R8"],["B","R5"],["B","R4"]],
[["G","B1 Battle"],["G","B1 Security"],["G","R9"]],
[["G","SENATE HOVERCAM"],["G","R3"],["G","2BB"]],
[["D","BDX Explorer"],["D","R5"],["D","R4"]],
[["D","B1 Battle"],["D","R8"],["D","R9"]],
[["R","B1 Security"],["R","R3"],["R","2BB"]],
[["R","BDX Explorer"],["R","R5"],["R","R4"]],
[["R","SENATE HOVERCAM"],["B","Groundmech"],["B","Trak-R"]],
[["B","B2 Heavy"],["B","B2 Super"],["B","Util-Tec"]],
[["R","Bal-Core"],["G","Groundmech"],["G","Trak-R"]],
[["B","Proto Roller"],["B","Mecha Droid"],["R","B2 Super"]],
[["R","B2 Heavy"],["B","B2-RP"],["G","R7"]],
[["G","Proto Roller"],["R","Strike-Orb"],["G","BB9"]],
[["R","Amp Walker"],["G","Mecha Droid"],["D","B2-RP"]],
[["R","Opti-Pod"],["G","Mono-Wlkr"],["D","R7"]],
[["D","Proto Roller"],["R","Util-Tec"],["D","BB9"]],
[["D","Mecha Droid"],["R","B2-RP"],["R","R7"]],
[["R","Mono-Wlkr"],["R","Opti-Strk"],["R","Cyclo-Grav"]],
[["K","Opti-Pod"],["K","B2 Super"],["K","R2"]],
[["K","Gunrunner"],["K","LNG-Shot"],["K","B2-RP"]],
[["K","Mono-Wlkr"],["K","Mecha Droid"],["K","Cyclo-Grav"]],
[["B","RIC"],["K","B2-RP"],["K","BB9"]],
[["K","Proto Roller"],["B","Loadlifter"],["G","Mo-Trak"]],
[["G","LEP"],["R","Snow Mouse"],["D","Tri-Tek"]],
[["D","RIC-1200"],["R","IG"],["K","Drft-R"]],
[["R","RIC"],["X","BB9"],["K","Mo-Trak"]],
[["X","Mecha Droid"],["X","Opti-Strk"],["K","IG"]],
[["K","LEP"],["X","R7"],["X","Drft-R"]],
[["K","Mecha-Droid"],["K","RIC-1200"],["S","B2 Heavy"]],
[["X","Groundmech"],["X","BB"],["K","Mo-Trak"]],
[["X","Mono-Wlkr"],["X","Loadlifter"],["S","Trak-R"]],
[["X","LEP"],["S","B2 Super"],["S","Orb Walker"]],
[["S","Proto Roller"],["S","RIC"],["S","KX"]],
],
4:[
[["B","Pit"],["B","ID10"],["B","DRK-1 PROBE"]],
[["B","SENATE HOVERCAM"],["B","R3"],["B","2BB"]],
[["G","R8"],["G","R5"],["B","R4"]],
[["G","B1 Battle"],["G","B1 Security"],["G","R9"]],
[["G","SENATE HOVERCAM"],["G","R3"],["G","2BB"]],
[["D","BDX Explorer"],["D","R5"],["D","R4"]],
[["D","B1 Battle"],["D","R8"],["D","R9"]],
[["R","B1 Security"],["R","R3"],["R","2BB"]],
[["R","BDX Explorer"],["R","R5"],["R","R4"]],
[["R","SENATE HOVERCAM"],["B","Groundmech"],["B","Trak-R"]],
[["B","B2 Heavy"],["B","B2 Super"],["B","Util-Tec"]],
[["R","Bal-Core"],["G","Groundmech"],["G","Trak-R"]],
[["B","Proto Roller"],["B","Mecha Droid"],["R","B2 Super"]],
[["D","Bal-Core"],["D","Groundmech"],["R","Trak-R"]],
[["D","B2 Heavy"],["R","B2 Super"],["B","B2-RP"]],
[["R","Util-Tec"],["B","BB9"],["G","R7"]],
[["G","Mecha Droid"],["B","Opti-Strk"],["G","Cyclo-Grav"]],
[["G","B2-RP"],["G","BB9"],["D","R7"]],
[["D","Mecha Droid"],["R","B2-RP"],["R","R7"]],
[["R","Mono-Wlkr"],["R","Opti-Strk"],["R","Cyclo-Grav"]],
[["K","Amp Walker"],["K","Groundmech"],["K","Haul-R"]],
[["K","Gunrunner"],["K","Strike-Orb"],["K","B2 Super"]],
[["K","Mono-Wlkr"],["K","B2-RP"],["K","Cyclo-Grav"]],
[["K","Proto Roller"],["K","Mecha Droid"],["B","Mo-Trak"]],
[["K","Opti-Strk"],["B","Tri-Tek"],["G","Drft-R"]],
[["D","LEP"],["G","Cyclens"],["R","Mo-Trak"]],
[["D","RIC-1200"],["R","Snow Mouse"],["K","Loadlifter"]],
[["X","Opti-Strk"],["R","IG"],["K","KX"]],
[["X","BB9"],["X","R7"],["K","Tri-Tek"]],
[["X","Mono-Wlkr"],["X","IG"],["K","Cyclens"]],
[["K","Cyclo-Grav"],["S","Trak-R"],["K","Tri-Tek"]],
[["K","IG"],["X","R2"],["X","R6"]],
[["X","RIC-1200"],["S","B2 Heavy"],["X","BB9"]],
[["S","Amp Walker"],["S","Strike-Orb"],["X","Mo-Trak"]],
[["S","LEP"],["S","Loadlifter"],["S","B2-RP"]],
],
5:[
[["B","Mouse"],["B","Gonk"],["B","ID10"]],
[["B","Roll-R"],["G","IMPERIAL PROBE"],["B","2BB"]],
[["G","BDX Explorer"],["B","Vect-Arm"],["B","R4"]],
[["G","B1 Battle"],["G","B1 Security"],["G","R9"]],
[["G","Bal-Core"],["G","R3"],["G","R4"]],
[["D","BDX Explorer"],["B","Gunrunner"],["D","2BB"]],
[["D","Roll-R"],["D","R5"],["G","R2"]],
[["D","B1 Battle"],["G","B2 Super"],["D","R8"]],
[["G","Amp Walker"],["R","Nav-Ex"],["G","Strike-Orb"]],
[["B","Groundmech"],["K","IMPERIAL PROBE"],["B","Trak-R"]],
[["B","B2 Heavy"],["B","B2 Super"],["B","Util-Tec"]],
[["R","Bal-Core"],["G","Groundmech"],["G","Trak-R"]],
[["G","B2 Super"],["G","B2 Heavy"],["D","R2"]],
[["D","Groundmech"],["D","Trak-R"],["R","Util-Tec"]],
[["D","B2 Heavy"],["D","B2 Super"],["B","B2-RP"]],
[["G","Proto Roller"],["B","BB9"],["G","R7"]],
[["G","Mecha Droid"],["B","Opti-Strk"],["G","Cyclo-Grav"]],
[["G","B2-RP"],["G","BB9"],["D","R7"]],
[["R","Mecha Droid"],["D","Cyclo-Grav"],["D","Opti-Strk"]],
[["R","B2-RP"],["R","BB9"],["R","R7"]],
[["K","LO"],["K","Strike-Orb"],["K","Haul-R"]],
[["K","Sen-Tri"],["K","Gunrunner"],["K","R6"]],
[["K","Cyclo-Grav"],["K","B2-RP"],["K","BB9"]],
[["K","Mono-Wlkr"],["K","Opti-Strk"],["B","Mo-Trak"]],
[["K","Mecha Droid"],["B","RIC"],["G","Tri-Tek"]],
[["D","LEP"],["R","Snow Mouse"],["G","Cyclens"]],
[["D","RIC-1200"],["K","Loadlifter"],["R","IG"]],
[["R","RIC"],["X","BB9"],["K","Mo-Trak"]],
[["X","Mecha Droid"],["X","Opti-Strk"],["K","IG"]],
[["K","LEP"],["X","R7"],["X","Cyclens"]],
[["S","Amp Walker"],["K","Snow Mouse"],["K","Opti-Strk"]],
[["X","LO"],["X","Trak-R"],["K","Drft-R"]],
[["S","Util-Tec"],["X","R7"],["X","Tri-Tek"]],
[["S","Haul-R"],["S","LNG-Shot"],["X","IG"]],
[["S","Mecha Droid"],["S","RIC-1200"],["S","Mo-Trak"]],
]
};

// low -> high
const RARITY_ORDER = ["B","G","D","R","K","X","S"]; // low -> high
function rankOf(code){ return RARITY_ORDER.indexOf(code); }

/* ---------------- droid RARITY CLASS (Common/Rare/Epic/Legendary/Mythic/Iconic) ----------------
   A second, separate axis from the Base->Stellar variant ladder above — this
   is the droid's fixed "class" (independent of which colorway you own), used
   only by the Safe to Retire / Declutter list: originally (2026-09-19) to
   filter down to Legendary/Mythic, and since v1.6.0 (2026-09-24) to group
   and tier-filter every droid it lists. All five tiers are now populated
   for every droid in CYCLES (see the note inside the table below); the
   provenance notes that follow describe the original Legendary/Mythic pass.

   Sourced from community guides, not the game's own files (this sandbox has
   no way to read those), so treat it as best-effort — cross-checked across
   five independent sources for exactly the two tiers that matter here:
     - igeeksblog.com and fandomscoop.com's droid-by-rarity lists (near-
       identical data, likely shared upstream source)
     - insider-gaming.com's Droidex writeup
     - droidex.nackz.dev/value-list/ — a comprehensive, independently-built
       community tracker with FULL Legendary/Mythic rosters including droids
       that don't even appear in this app's CYCLES table
     - droidex.nackz.dev/faq/ — same site, different page, independently
       lists a Droid Fusion example set that exactly matches its own
       value-list's Legendary/Mythic assignments (internal consistency check)
   Every Legendary/Mythic name below appears in at least 2 of these sources
   with zero disagreement. (Common/Rare/Epic were left out at first since
   nothing distinguished them yet — added in v1.6.0, see below.) Iconic droids
   (event-exclusive characters like BB-8, DJ-R3X) never appear in CYCLES at
   all, so they're absent from this table by construction, not by oversight.
   Both raw spellings of names CYCLES itself is inconsistent about (e.g.
   "Mecha Droid"/"Mecha-Droid") are included so lookup never misses either
   form; the lookup in requirements.js normalizes with normKey() regardless. */
// Tier order, lowest to highest. "Default" is what the game's own UI calls
// the lowest class (community sites like droidex call it "Common").
const RARITY_CLASS_ORDER = ['Default', 'Rare', 'Epic', 'Legendary', 'Mythic'];

const DROID_RARITY_CLASS = {
  // Default/Common, Rare and Epic added 2026-09-24 (source: droidex.nackz.dev
  // value list, cross-checked name-by-name against every unique droid in
  // CYCLES — all 62 covered, and its Legendary/Mythic entries agreed with
  // the ones below that were already here). Needed once the Safe to Retire
  // list started showing every tier, not just Legendary/Mythic.
  "Gonk": "Default", "Mouse": "Default", "Pit": "Default", "R8": "Default",
  "CB": "Default", "R3": "Default", "R5": "Default", "IMPERIAL PROBE": "Default",
  "B1 Battle": "Default", "ID10": "Default", "DRK-1 PROBE": "Default",
  "B-U4D": "Rare", "SENATE HOVERCAM": "Rare", "ARG": "Rare", "Roll-R": "Rare",
  "Bal-Core": "Rare", "BDX Explorer": "Rare", "R9": "Rare", "R4": "Rare",
  "A-LT": "Rare", "2BB": "Rare", "B1 Security": "Rare", "Hov-R": "Rare",
  "Vect-Arm": "Rare", "Nav-Ex": "Rare",
  "Gunrunner": "Epic", "Amp Walker": "Epic", "Sen-Tri": "Epic", "Opti-Pod": "Epic",
  "LO": "Epic", "Groundmech": "Epic", "R2": "Epic", "Trak-R": "Epic", "R6": "Epic",
  "Util-Tec": "Epic", "Orb Walker": "Epic", "BB": "Epic", "B1 Heavy": "Epic",
  "Strike-Orb": "Epic", "B2 Heavy": "Epic", "LNG-Shot": "Epic", "B2 Super": "Epic",
  "Haul-R": "Epic",
  // Legendary (8 canonical droids, some with 2 raw spellings in CYCLES)
  "Proto Roller": "Legendary",
  "Mecha Droid": "Legendary",
  "Mecha-Droid": "Legendary",
  "Mono-Wlkr": "Legendary",
  "Mono Wlkr": "Legendary",
  "BB9": "Legendary",
  "R7": "Legendary",
  "B2-RP": "Legendary",
  "Cyclo-Grav": "Legendary",
  "Opti-Strk": "Legendary",
  // Mythic (11 canonical droids)
  "Mo-Trak": "Mythic",
  "IG": "Mythic",
  "Drft-R": "Mythic",
  "Loadlifter": "Mythic",
  "RIC-1200": "Mythic",
  "Cyclens": "Mythic",
  "Snow Mouse": "Mythic",
  "KX": "Mythic",
  "Tri-Tek": "Mythic",
  "RIC": "Mythic",
  "LEP": "Mythic"
};
