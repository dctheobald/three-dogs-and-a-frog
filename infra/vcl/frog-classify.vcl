declare local var.frog_class STRING;

if (!fastly.bot.analyzed) {
  set var.frog_class = "unknown";
} else if (!fastly.bot.detected) {
  set var.frog_class = "human";
} else if (fastly.bot.category.is_verified) {
  set var.frog_class = "verified-agent";
} else {
  set var.frog_class = "bot";
}

set req.http.X-Frog-Class = var.frog_class;
if (fastly.bot.detected && fastly.bot.name != "") {
  set req.http.X-Frog-Bot-Name = fastly.bot.name;
}
