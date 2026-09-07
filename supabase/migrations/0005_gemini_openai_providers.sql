-- Amplia i motori disponibili in ogni categoria (richiesta: "come Higgsfield,
-- una piattaforma e poi i vari motori tutti lì"):
--  - thumb_text_providers già ammette 'gemini' dallo schema iniziale — nessuna
--    modifica di schema qui, solo l'implementazione lato edge function.
--  - thumb_image_providers e thumb_edit_providers: aggiungiamo 'openai'
--    (generazione/editing diretti via gpt-image-1, senza passare da fal/
--    Replicate come intermediari).
alter table public.thumb_image_providers drop constraint thumb_image_providers_kind_check;
alter table public.thumb_image_providers add constraint thumb_image_providers_kind_check
  check (kind = any (array['huggingface','fal','replicate','openai','manual']));

alter table public.thumb_edit_providers drop constraint thumb_edit_providers_kind_check;
alter table public.thumb_edit_providers add constraint thumb_edit_providers_kind_check
  check (kind = any (array['huggingface','fal','replicate','openai']));
