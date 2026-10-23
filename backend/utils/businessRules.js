// Pure business rules shared by models and controllers.
// Kept free of database access so they can be unit tested on their own.

const JV_REQUIRED_FIELDS = [
    'companyName', 'registrationNumber', 'sharePercentage',
    'contactPerson', 'contactEmail', 'contactPhone'
];

/**
 * Validates joint-venture partners for a business opportunity.
 * Returns an error message, or null when the partners are valid.
 */
function validateJointVenture(partners) {
    if (!Array.isArray(partners) || partners.length === 0) {
        return null;
    }

    const frontParties = partners.filter(p => p.isFrontParty);
    if (frontParties.length !== 1) {
        return 'Exactly one joint venture partner must be designated as the front party';
    }

    const totalShare = partners.reduce((sum, p) => sum + Number(p.sharePercentage || 0), 0);
    if (Math.abs(totalShare - 100) > 0.01) {
        return 'Total share percentage of all joint venture partners must equal 100%';
    }

    const missingFields = partners.some(p => JV_REQUIRED_FIELDS.some(field => !p[field]));
    if (missingFields) {
        return 'All required fields must be provided for each joint venture partner';
    }

    return null;
}

/**
 * Builds the next opportunity number in the format EPPL/<year>/<4-digit serial>.
 * The serial restarts every year.
 */
function nextOpportunityNumber(lastNumber, year) {
    let nextSerial = 1;
    if (lastNumber) {
        const [, lastYear, lastSerial] = lastNumber.split('/');
        if (Number(lastYear) === Number(year)) {
            nextSerial = parseInt(lastSerial, 10) + 1;
        }
    }
    return `EPPL/${year}/${String(nextSerial).padStart(4, '0')}`;
}

/**
 * Calculates the final variation amount and final accepted amount for a won tender.
 */
function calculateWonAmounts(negotiatedAmount, finalVariationPercentage) {
    const negotiated = Number(negotiatedAmount) || 0;
    const percentage = Number(finalVariationPercentage) || 0;
    const finalVariationAmount = (negotiated * percentage) / 100;
    return {
        finalVariationAmount,
        finalAcceptedAmount: negotiated + finalVariationAmount
    };
}

module.exports = { validateJointVenture, nextOpportunityNumber, calculateWonAmounts };
