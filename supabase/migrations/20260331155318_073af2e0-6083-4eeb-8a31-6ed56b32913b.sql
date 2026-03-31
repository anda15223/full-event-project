UPDATE emails 
SET parse_status = 'pending', 
    body_text = NULL, 
    body_html = NULL, 
    body_clean_text = NULL,
    parse_error = NULL
WHERE (parse_status = 'parsed' AND body_text IS NOT NULL AND length(body_text) > 200 AND body_text ~ '^[A-Za-z0-9+/=\s]{200,}$')
   OR (parse_status = 'parsed' AND body_html IS NULL AND body_text IS NULL AND has_attachments = true);