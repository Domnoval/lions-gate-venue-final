/* Public, safe-to-commit Supabase config. The anon key is read-only by RLS
   (see supabase/schema.sql). NEVER put the service-role key here. The
   operator fills these two after the Supabase project exists (prereq P1). */
window.CMS_SUPABASE_URL = "https://odnzkrgegbqucxqhjdjh.supabase.co";
window.CMS_SUPABASE_ANON_KEY = "sb_publishable_LIe_2wjmhL4GTcDrwcnKsA_kU-q3Lnq";
window.CMS_PHOTO_BUCKET = "site-photos";

/* Single source of truth. Each entry:
   path:   dot path inside the JSON record
   sel:    CSS selector resolving to exactly one element on index.html
   kind:   "text" (textContent) | "multiline" (text w/ \n -> <br>) | "image" (img src)
   label:  human label for the admin form
   group:  admin accordion group
   max:    soft char limit (counter warns past this; not enforced hard) */
window.CMS_FIELDS = [
  { path:"hero.eyebrow",  sel:'[data-cms="hero.eyebrow"]',  kind:"text",      label:"Eyebrow",  group:"Hero", max:60 },
  { path:"hero.headline", sel:'[data-cms="hero.headline"]', kind:"multiline", label:"Headline", group:"Hero", max:90 },
  // hero.body omitted — contains <em> inline HTML that textContent strips (C1)

  ...[0,1,2,3,4,5].flatMap(i => ([
    { path:`spaces.${i}.tag`,  sel:`[data-cms="spaces.${i}.tag"]`,  kind:"text",  label:`Space ${i+1} — label`,       group:"The Spaces", max:24 },
    { path:`spaces.${i}.name`, sel:`[data-cms="spaces.${i}.name"]`, kind:"text",  label:`Space ${i+1} — name`,        group:"The Spaces", max:28 },
    { path:`spaces.${i}.desc`, sel:`[data-cms="spaces.${i}.desc"]`, kind:"text",  label:`Space ${i+1} — description`, group:"The Spaces", max:160 },
    { path:`spaces.${i}.img`,  sel:`[data-cms="spaces.${i}.img"]`,  kind:"image", label:`Space ${i+1} — photo`,       group:"The Spaces" },
  ])),

  ...[0,1,2].flatMap(i => ([
    { path:`pricing.${i}.name`, sel:`[data-cms="pricing.${i}.name"]`, kind:"text", label:`Pricing ${i+1} — name`,  group:"Pricing", max:28 },
    { path:`pricing.${i}.desc`, sel:`[data-cms="pricing.${i}.desc"]`, kind:"text", label:`Pricing ${i+1} — body`,  group:"Pricing", max:220 },
    { path:`pricing.${i}.rate`, sel:`[data-cms="pricing.${i}.rate"]`, kind:"text", label:`Pricing ${i+1} — rate line`, group:"Pricing", max:90 },
  ])),

  // testimonials.*.attribution omitted — contains <br><span> HTML that textContent strips (C1)
  ...[0,1].map(i => (
    { path:`testimonials.${i}.quote`, sel:`[data-cms="testimonials.${i}.quote"]`, kind:"text", label:`Testimonial ${i+1} — quote`, group:"Testimonials", max:240 }
  )),

  { path:"photos.essenceBg",    sel:'[data-cms="photos.essenceBg"]',    kind:"image", label:"Essence background", group:"Photos" },
  { path:"photos.ledHero",      sel:'[data-cms="photos.ledHero"]',      kind:"image", label:"Mark — LED hero",    group:"Photos" },
  { path:"photos.ledPortrait",  sel:'[data-cms="photos.ledPortrait"]',  kind:"image", label:"Mark — portrait",    group:"Photos" },
  { path:"photos.dayImg",       sel:'[data-cms="photos.dayImg"]',       kind:"image", label:"Day/Night — day",    group:"Photos" },
  { path:"photos.nightImg",     sel:'[data-cms="photos.nightImg"]',     kind:"image", label:"Day/Night — night",  group:"Photos" },
];

window.CMS_GET = (obj, path) =>
  path.split(".").reduce((o,k)=> (o==null ? undefined : o[k]), obj);
