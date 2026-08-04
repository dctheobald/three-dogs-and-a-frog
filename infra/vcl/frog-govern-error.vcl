# Build 2 -- render the governed 429 (distinct from the ERL backstop 429).
if (obj.status == 429 && obj.response == "frog-governed") {
  set obj.http.Content-Type = "text/plain";
  synthetic {"Ribbit -- the Wise Frog only serves verified guests at this pond. (governed at the edge)"};
  return(deliver);
}
