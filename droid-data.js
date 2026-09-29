/* Shared droid/rarity data, extracted verbatim from the tracker's original script.
   Loaded by both tracker.html and overlay.html so they never drift apart. */
const RCOLOR = {B:"var(--r-base)",G:"var(--r-gold)",D:"var(--r-diamond)",R:"rainbow",K:"var(--r-beskar)",X:"var(--r-galactic)",S:"var(--r-stellar)",Y:"var(--kyber)"};
const RNAME = {B:"Base",G:"Gold",D:"Diamond",R:"Rainbow",K:"Beskar",X:"Galactic",S:"Stellar",Y:"Kyber"};
const RCLASS = {B:"rarity-base",G:"rarity-gold",D:"rarity-diamond",R:"rarity-rainbow",K:"rarity-beskar",X:"rarity-galactic",S:"rarity-stellar",Y:"rarity-kyber"};

// each cycle: array of 40 levels, each level = array of 3 [rarityCode, name]
const CYCLES = {
1:[
[["B","CB"],["B","Pit"],["B","DRK-1 PROBE"]],
[["B","BDX Explorer"],["B","2BB"],["B","Bal-Core"]],
[["B","A-LT"],["B","B-U4D"],["G","R9"]],
[["G","ARG"],["G","B1 Security"],["B","Groundmech"]],
[["G","B-U4D"],["G","Hov-R"],["D","R9"]],
[["G","Groundmech"],["D","ARG"],["D","A-LT"]],
[["G","BB"],["D","B1 Security"],["D","B-U4D"]],
[["G","Util-Tec"],["G","LO"],["D","Hov-R"]],
[["R","Groundmech"],["G","R6"],["G","Trak-R"]],
[["R","LO"],["R","Haul-R"],["G","Strike-Orb"]],
[["R","Amp Walker"],["R","B1 Heavy"],["B","BB9"]],
[["G","Proto Roller"],["B","Mono-Wlkr"],["B","Mecha Droid"]],
[["B","R7"],["B","Cyclo-Grav"],["B","B2-RP"]],
[["B","Opti-Strk"],["G","Mono-Wlkr"],["G","Mecha Droid"]],
[["G","B2-RP"],["G","BB9"],["G","R7"]],
[["G","Opti-Strk"],["D","Mono-Wlkr"],["D","Proto Roller"]],
[["D","B2-RP"],["D","Cyclo-Grav"],["D","Mecha Droid"]],
[["D","BB9"],["D","R7"],["R","Mono-Wlkr"]],
[["R","B2-RP"],["R","Cyclo-Grav"],["R","Proto Roller"]],
[["R","R7"],["R","Opti-Strk"],["R","Mecha Droid"]],
[["K","BB"],["K","Orb Walker"],["K","Groundmech"]],
[["K","Amp Walker"],["K","B1 Heavy"],["K","Proto Roller"]],
[["K","Opti-Strk"],["K","Mono-Wlkr"],["K","R7"]],
[["K","BB9"],["K","Cyclo-Grav"],["B","Mo-Trak"]],
[["K","B2-RP"],["B","IG"],["G","Drft-R"]],
[["G","Cyclens"],["D","Loadlifter"],["R","RIC-1200"]],
[["D","KX"],["R","Tri-Tek"],["K","Snow Mouse"]],
[["R","Mo-Trak"],["K","Drft-R"],["X","Proto Roller"]],
[["K","IG"],["X","Mono-Wlkr"],["X","Mecha Droid"]],
[["X","B2-RP"],["K","Cyclens"],["X","Loadlifter"]],
[["S","Sen-Tri"],["K","Proto Roller"],["K","KX"]],
[["X","Orb Walker"],["X","Opti-Pod"],["K","RIC"]],
[["S","B1 Heavy"],["X","Cyclo-Grav"],["X","Drft-R"]],
[["S","Groundmech"],["S","BB"],["X","Cyclens"]],
[["S","BB9"],["S","IG"],["S","Snow Mouse"]],
[["Y","BDX Explorer"],["Y","2BB"],["Y","A-LT"]],
[["Y","B1 Heavy"],["Y","Groundmech"],["Y","BB"]],
[["Y","R2"],["Y","R6"],["Y","BB9"]],
[["Y","R7"],["Y","Proto Roller"],["Y","IG"]],
[["Y","Snow Mouse"],["Y","Drft-R"],["Y","Cyclens"]],
],
2:[
[["B","Mouse"],["B","Gonk"],["B","ID10"]],
[["B","Roll-R"],["B","Nav-Ex"],["B","SENATE HOVERCAM"]],
[["B","R4"],["B","Vect-Arm"],["G","BDX Explorer"]],
[["G","2BB"],["G","Bal-Core"],["B","Orb Walker"]],
[["G","R4"],["G","Vect-Arm"],["G","Nav-Ex"]],
[["B","Gunrunner"],["D","2BB"],["D","Bal-Core"]],
[["D","Roll-R"],["D","BDX Explorer"],["G","R2"]],
[["D","R4"],["G","B2 Super"],["G","Gunrunner"]],
[["R","Nav-Ex"],["G","Strike-Orb"],["G","Amp Walker"]],
[["R","Vect-Arm"],["D","R2"],["D","B2 Super"]],
[["D","Strike-Orb"],["D","B2 Heavy"],["R","Bal-Core"]],
[["R","Orb Walker"],["R","R2"],["B","BB9"]],
[["R","B2 Super"],["B","Mecha Droid"],["B","Proto Roller"]],
[["R","B2 Heavy"],["B","B2-RP"],["G","R7"]],
[["R","Strike-Orb"],["G","BB9"],["G","Proto Roller"]],
[["D","B2-RP"],["R","Amp Walker"],["G","Mecha Droid"]],
[["R","Opti-Pod"],["D","R7"],["G","Mono-Wlkr"]],
[["R","Util-Tec"],["D","BB9"],["D","Proto Roller"]],
[["D","Mecha Droid"],["R","R7"],["R","B2-RP"]],
[["R","Mono-Wlkr"],["R","Opti-Strk"],["R","Cyclo-Grav"]],
[["K","LO"],["K","R6"],["K","Haul-R"]],
[["K","Sen-Tri"],["K","Strike-Orb"],["K","Proto Roller"]],
[["K","BB9"],["K","Cyclo-Grav"],["K","B2-RP"]],
[["K","Opti-Strk"],["K","B2-RP"],["B","Snow Mouse"]],
[["K","Mono-Wlkr"],["G","Tri-Tek"],["B","RIC-1200"]],
[["G","KX"],["D","Drft-R"],["R","IG"]],
[["D","LEP"],["R","Loadlifter"],["K","Mo-Trak"]],
[["R","Snow Mouse"],["K","Tri-Tek"],["X","Mecha Droid"]],
[["K","RIC"],["X","Cyclo-Grav"],["X","R7"]],
[["X","Opti-Strk"],["K","KX"],["X","Drft-R"]],
[["S","B2 Super"],["K","B2-RP"],["K","Loadlifter"]],
[["X","Gunrunner"],["X","B1 Heavy"],["K","LEP"]],
[["S","R2"],["X","Opti-Strk"],["X","KX"]],
[["S","R6"],["S","LO"],["X","RIC"]],
[["S","R7"],["S","Drft-R"],["S","Cyclens"]],
[["Y","B1 Security"],["Y","R4"],["Y","R9"]],
[["Y","LO"],["Y","Trak-R"],["Y","Orb Walker"]],
[["Y","B2 Super"],["Y","B2 Heavy"],["Y","B2-RP"]],
[["Y","Mecha Droid"],["Y","Cyclo-Grav"],["Y","KX"]],
[["Y","RIC"],["Y","Loadlifter"],["Y","LEP"]],
],
3:[
[["B","Mouse"],["B","Pit"],["B","Gonk"]],
[["B","2BB"],["B","R3"],["B","SENATE HOVERCAM"]],
[["B","R4"],["B","R5"],["B","R8"]],
[["G","R9"],["G","B1 Battle"],["G","B1 Security"]],
[["G","2BB"],["G","R3"],["G","SENATE HOVERCAM"]],
[["D","BDX Explorer"],["D","R4"],["D","R5"]],
[["D","R8"],["D","R9"],["D","B1 Battle"]],
[["R","B1 Security"],["R","R3"],["R","2BB"]],
[["R","BDX Explorer"],["R","R4"],["R","R5"]],
[["B","Trak-R"],["B","Groundmech"],["R","SENATE HOVERCAM"]],
[["B","B2 Heavy"],["B","B2 Super"],["B","Util-Tec"]],
[["G","Trak-R"],["G","Groundmech"],["R","Bal-Core"]],
[["R","B2 Super"],["B","Mecha Droid"],["B","Proto Roller"]],
[["R","B2 Heavy"],["B","B2-RP"],["G","R7"]],
[["R","Strike-Orb"],["G","BB9"],["G","Proto Roller"]],
[["R","Amp Walker"],["D","B2-RP"],["G","Mecha Droid"]],
[["R","Opti-Pod"],["D","R7"],["G","Mono-Wlkr"]],
[["R","Util-Tec"],["D","BB9"],["D","Proto Roller"]],
[["D","Mecha Droid"],["R","R7"],["R","B2-RP"]],
[["R","Mono-Wlkr"],["R","Opti-Strk"],["R","Cyclo-Grav"]],
[["K","B2 Super"],["K","Opti-Pod"],["K","R2"]],
[["K","Gunrunner"],["K","LNG-Shot"],["K","B2-RP"]],
[["K","Mono-Wlkr"],["K","Mecha Droid"],["K","Cyclo-Grav"]],
[["K","BB9"],["K","B2-RP"],["B","RIC"]],
[["K","Proto Roller"],["B","Loadlifter"],["G","Mo-Trak"]],
[["G","LEP"],["D","Tri-Tek"],["R","Snow Mouse"]],
[["D","RIC-1200"],["R","IG"],["K","Drft-R"]],
[["R","RIC"],["K","Mo-Trak"],["X","BB9"]],
[["K","IG"],["X","Mecha Droid"],["X","Opti-Strk"]],
[["X","R7"],["K","LEP"],["X","Drft-R"]],
[["S","B2 Heavy"],["K","Mecha Droid"],["K","RIC-1200"]],
[["X","Groundmech"],["X","BB"],["K","Mo-Trak"]],
[["S","Trak-R"],["X","Mono-Wlkr"],["X","Loadlifter"]],
[["S","Orb Walker"],["S","B2 Super"],["X","LEP"]],
[["S","Proto Roller"],["S","KX"],["S","RIC"]],
[["Y","ARG"],["Y","SENATE HOVERCAM"],["Y","B-U4D"]],
[["Y","Strike-Orb"],["Y","Amp Walker"],["Y","Util-Tec"]],
[["Y","Haul-R"],["Y","LNG-Shot"],["Y","Opti-Strk"]],
[["Y","Mono-Wlkr"],["Y","BB9"],["Y","RIC-1200"]],
[["Y","Mo-Trak"],["Y","Tri-Tek"],["Y","IG"]],
],
4:[
[["B","ID10"],["B","Pit"],["B","DRK-1 PROBE"]],
[["B","R3"],["B","2BB"],["B","SENATE HOVERCAM"]],
[["B","R4"],["G","R5"],["G","R8"]],
[["G","R9"],["G","B1 Battle"],["G","B1 Security"]],
[["G","2BB"],["G","R3"],["G","SENATE HOVERCAM"]],
[["D","BDX Explorer"],["D","R4"],["D","R5"]],
[["D","R8"],["D","R9"],["D","B1 Battle"]],
[["R","B1 Security"],["R","R3"],["R","2BB"]],
[["R","BDX Explorer"],["R","R4"],["R","R5"]],
[["B","Trak-R"],["B","Groundmech"],["R","SENATE HOVERCAM"]],
[["B","B2 Heavy"],["B","B2 Super"],["B","Util-Tec"]],
[["R","Bal-Core"],["G","Groundmech"],["G","Trak-R"]],
[["R","B2 Super"],["B","Mecha Droid"],["B","Proto Roller"]],
[["D","Bal-Core"],["D","Groundmech"],["R","Trak-R"]],
[["D","B2 Heavy"],["R","B2 Super"],["B","B2-RP"]],
[["R","Util-Tec"],["B","BB9"],["G","R7"]],
[["B","Opti-Strk"],["G","Cyclo-Grav"],["G","Mecha Droid"]],
[["G","B2-RP"],["G","BB9"],["D","R7"]],
[["D","Mecha Droid"],["R","R7"],["R","B2-RP"]],
[["R","Mono-Wlkr"],["R","Opti-Strk"],["R","Cyclo-Grav"]],
[["K","Haul-R"],["K","Groundmech"],["K","Amp Walker"]],
[["K","Gunrunner"],["K","Strike-Orb"],["K","B2 Super"]],
[["K","Mono-Wlkr"],["K","Cyclo-Grav"],["K","B2-RP"]],
[["K","Mecha Droid"],["K","Proto Roller"],["B","Mo-Trak"]],
[["K","Opti-Strk"],["B","Tri-Tek"],["G","Drft-R"]],
[["G","Cyclens"],["D","LEP"],["R","Mo-Trak"]],
[["D","RIC-1200"],["R","Snow Mouse"],["K","Loadlifter"]],
[["R","IG"],["K","KX"],["X","Opti-Strk"]],
[["K","Tri-Tek"],["X","R7"],["X","BB9"]],
[["X","Mono-Wlkr"],["K","Cyclens"],["X","IG"]],
[["S","Trak-R"],["K","Cyclo-Grav"],["K","Tri-Tek"]],
[["X","R2"],["X","R6"],["K","IG"]],
[["S","B2 Heavy"],["X","BB9"],["X","RIC-1200"]],
[["S","Strike-Orb"],["S","Amp Walker"],["X","Mo-Trak"]],
[["S","B2-RP"],["S","Loadlifter"],["S","LEP"]],
[["Y","Nav-Ex"],["Y","Bal-Core"],["Y","Vect-Arm"]],
[["Y","Sen-Tri"],["Y","Opti-Pod"],["Y","Gunrunner"]],
[["Y","B1 Heavy"],["Y","Groundmech"],["Y","R7"]],
[["Y","Proto Roller"],["Y","B2-RP"],["Y","Snow Mouse"]],
[["Y","Drft-R"],["Y","Cyclens"],["Y","KX"]],
],
5:[
[["B","ID10"],["B","Mouse"],["B","Gonk"]],
[["B","2BB"],["G","IMPERIAL PROBE"],["B","Roll-R"]],
[["B","R4"],["B","Vect-Arm"],["G","BDX Explorer"]],
[["G","R9"],["G","B1 Battle"],["G","B1 Security"]],
[["G","Bal-Core"],["G","R4"],["G","R3"]],
[["B","Gunrunner"],["D","2BB"],["D","BDX Explorer"]],
[["D","Roll-R"],["D","R5"],["G","R2"]],
[["G","B2 Super"],["D","R8"],["D","B1 Battle"]],
[["R","Nav-Ex"],["G","Strike-Orb"],["G","Amp Walker"]],
[["K","IMPERIAL PROBE"],["B","Groundmech"],["B","Trak-R"]],
[["B","B2 Heavy"],["B","B2 Super"],["B","Util-Tec"]],
[["R","Bal-Core"],["G","Groundmech"],["G","Trak-R"]],
[["G","B2 Super"],["G","B2 Heavy"],["D","R2"]],
[["D","Groundmech"],["D","Trak-R"],["R","Util-Tec"]],
[["D","B2 Heavy"],["D","B2 Super"],["B","B2-RP"]],
[["B","BB9"],["G","R7"],["G","Proto Roller"]],
[["B","Opti-Strk"],["G","Cyclo-Grav"],["G","Mecha Droid"]],
[["G","BB9"],["G","B2-RP"],["D","R7"]],
[["D","Opti-Strk"],["D","Cyclo-Grav"],["R","Mecha Droid"]],
[["R","B2-RP"],["R","BB9"],["R","R7"]],
[["K","LO"],["K","Strike-Orb"],["K","Haul-R"]],
[["K","Sen-Tri"],["K","R6"],["K","Gunrunner"]],
[["K","BB9"],["K","Cyclo-Grav"],["K","B2-RP"]],
[["K","Mono-Wlkr"],["K","Opti-Strk"],["B","Mo-Trak"]],
[["K","Mecha Droid"],["B","RIC"],["G","Tri-Tek"]],
[["G","Cyclens"],["D","LEP"],["R","Snow Mouse"]],
[["D","RIC-1200"],["R","IG"],["K","Loadlifter"]],
[["R","RIC"],["K","Mo-Trak"],["X","BB9"]],
[["K","IG"],["X","Mecha Droid"],["X","Opti-Strk"]],
[["X","R7"],["K","LEP"],["X","Cyclens"]],
[["S","Amp Walker"],["K","Opti-Strk"],["K","Snow Mouse"]],
[["X","LO"],["X","Trak-R"],["K","Drft-R"]],
[["S","Util-Tec"],["X","R7"],["X","Tri-Tek"]],
[["S","Haul-R"],["S","LNG-Shot"],["X","IG"]],
[["S","Mecha Droid"],["S","RIC-1200"],["S","Mo-Trak"]],
[["Y","Roll-R"],["Y","Hov-R"],["Y","Mouse"]],
[["Y","BB"],["Y","R2"],["Y","R6"]],
[["Y","LO"],["Y","Trak-R"],["Y","Mecha Droid"]],
[["Y","Cyclo-Grav"],["Y","Opti-Strk"],["Y","RIC"]],
[["Y","Loadlifter"],["Y","LEP"],["Y","RIC-1200"]],
]
};

// low -> high
const RARITY_ORDER = ["B","G","D","R","K","X","S","Y"]; // low -> high (Y=Kyber is highest)
function rankOf(code){ return RARITY_ORDER.indexOf(code); }
/* ---------------- rebirth CREDIT COST (v1.15.1) ----------------
   The credits the game asks for to go through with each rebirth. Index =
   rebirth level - 1, so REBIRTH_CREDITS[0] is Rebirth 1. Levels 1-35 come from
   the community "Super Rebirth" chart (Update v1.26, 2026-08-16); 36-40 the
   user gave separately. Treated as the same in every cycle; rebirthCreditsFor()
   in requirements.js is the only lookup, so a per-cycle table can slot in there
   later. The 🎯 Upcoming RB Req's HUD shows each level's cost the way the game
   writes it (formatCredits(): 10K, 1.36B, 1.19QA). */
const REBIRTH_CREDITS = [
  10e3, 150e3, 975e3, 2.95e6, 5.35e6, 9.85e6, 14.5e6, 36e6, 89e6, 220e6,          // 1-10
  550e6, 1.36e9, 3.4e9, 8.45e9, 21e9, 52e9, 130e9, 325e9, 810e9, 2e12,            // 11-20
  3e12, 4.5e12, 6e12, 9e12, 13.5e12, 21e12, 32e12, 45e12, 68e12, 100e12,          // 21-30
  150e12, 230e12, 345e12, 520e12, 778e12, 1.19e15, 2.5e15, 4.5e15, 8e15, 15e15    // 31-40
];

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
