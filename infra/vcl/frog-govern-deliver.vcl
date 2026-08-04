# Build 2 -- expose the edge's classification + governance decision on the response
# (demo affordance; safe to remove for production).
set resp.http.X-Frog-Class = req.http.X-Frog-Class;
if (req.http.X-Frog-Govern) {
  set resp.http.X-Frog-Govern = req.http.X-Frog-Govern;
}
