package whoami

import "time"

func currentTime() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
