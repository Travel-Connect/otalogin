-- Update Rakuten login URL to new API endpoint
UPDATE channels
SET login_url = 'https://api.travel.rakuten.com/everest/extranet/omni/startPage',
    updated_at = now()
WHERE code = 'rakuten';
