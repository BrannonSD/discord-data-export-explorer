# Discord Data Export Explorer 1.3.2

- Update the Node source runtime baseline and Express dependencies for current security advisories.
- Bind the Node server explicitly to loopback.
- Restrict both the Node and standalone Python servers to local hosts and origins, preventing cross-site export access and DNS rebinding.
- Disable caching of private exports and prevent framing.

The standalone Windows app uses the Python server, not Node; its binary is rebuilt independently from the updated source.
