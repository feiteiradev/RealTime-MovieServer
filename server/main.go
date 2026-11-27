// Command campfire runs the Room server with the frontend embedded.
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"

	"campfire/room"
	"campfire/transport"
)

// dist is filled by the web build (`make build`); a fresh checkout holds only .gitkeep.
//
//go:embed all:dist
var dist embed.FS

func main() {
	port := flag.Int("port", 8080, "port to listen on")
	flag.Parse()

	static, _ := fs.Sub(dist, "dist")
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Campfire is running at http://localhost:%d\n", *port)
	log.Fatal(http.Serve(ln, transport.Handler(room.New(), static)))
}
