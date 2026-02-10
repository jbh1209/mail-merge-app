

# Fix: ICC Profile Path

The `convertToCmykSafe()` function in `tmp/vps/server.js` currently looks for ICC profiles at `/app/icc/`, but on your VPS they're in `/profiles`.

## Change

Update two path references in the `convertToCmykSafe` function (lines 55-56):

**Before:**
```javascript
const profilePath = iccProfile === 'fogra39'
  ? '/app/icc/ISOcoated_v2_eci.icc'
  : '/app/icc/GRACoL2013_CRPC6.icc';
```

**After:**
```javascript
const profilePath = iccProfile === 'fogra39'
  ? '/profiles/ISOcoated_v2_eci.icc'
  : '/profiles/GRACoL2013_CRPC6.icc';
```

Also update the health check (lines 157-158) that verifies profile availability:

**Before:**
```javascript
['GRACoL2013', '/app/icc/GRACoL2013_CRPC6.icc'],
['Fogra39', '/app/icc/ISOcoated_v2_eci.icc'],
```

**After:**
```javascript
['GRACoL2013', '/profiles/GRACoL2013_CRPC6.icc'],
['Fogra39', '/profiles/ISOcoated_v2_eci.icc'],
```

That's it -- four path strings changed from `/app/icc/` to `/profiles/`.

