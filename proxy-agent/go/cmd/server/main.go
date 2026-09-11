package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/omidgfx/opendoc-ui/proxy-agent/go/proxyagent"
)

func main() {
	config := proxyagent.ConfigFromEnv()
	bind := os.Getenv("OPENDOC_BIND")
	if bind == "" {
		bind = "0.0.0.0"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	address := fmt.Sprintf("%s:%s", bind, port)
	log.Printf("OpenDoc UI proxy agent listening on http://%s", address)
	log.Fatal(http.ListenAndServe(address, proxyagent.NewHandler(config)))
}
