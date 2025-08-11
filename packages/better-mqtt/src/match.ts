// lib.ts

/**
 * Matches an MQTT topic against a subscription pattern and extracts the wildcard parameters.
 *
 * @param topic The topic string to test (e.g., "system/events/ev123").
 * @param pattern The subscription pattern (e.g., "system/events/+").
 * @returns An array of the captured parameter strings, or `null` if the topic does not match or the pattern is invalid.
 */
export function matchTopic(
    topic: string,
    pattern: string
): { params: string[] } | null {
    if (!(topic && pattern)) {
        return null
    }

    const patternSegments = pattern.split('/')

    // Handle MQTT shared subscriptions by removing the prefix from the pattern.
    // Format: $share/group-name/topic
    if (patternSegments[0] === '$share') {
        if (patternSegments.length < 3) {
            return null // Invalid $share pattern
        }
        patternSegments.splice(0, 2) // Remove $share and group-name
    } else if (patternSegments[0] === '$queue') {
        if (patternSegments.length < 2) {
            return null // Invalid $queue pattern
        }
        patternSegments.shift() // Remove $queue
    }

    const processedPattern = patternSegments.join('/')

    // Per MQTT spec, the '#' wildcard must be the last character of the pattern.
    if (
        processedPattern.includes('#') &&
        processedPattern.indexOf('#') !== processedPattern.length - 1
    ) {
        // Invalid pattern, e.g., "system/#/errors"
        return null
    }

    // Convert the MQTT pattern to a regular expression with capturing groups.
    const regexString = `^${processedPattern
        .replace(/\+/g, '([^/]+)') // '+' matches one level, capture it.
        .replace(/#/g, '(.*)')}$`

    const regex = new RegExp(regexString)
    const match: RegExpExecArray | null = regex.exec(topic)

    if (!match) {
        return null // No match found.
    }

    // The first element of the match array is the full string, so we slice it off.
    // If there are no wildcards, this will correctly return an empty array.
    return { params: match.slice(1) }
}
