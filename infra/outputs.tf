output "origin_ip" {
  value       = google_compute_instance.retail_origin.network_interface[0].access_config[0].nat_ip
  description = "The public IP of the 3 Dogs and a Frog store. Point Fastly here!"
}
