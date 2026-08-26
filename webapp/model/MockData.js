sap.ui.define([], function () {
    "use strict";

    var aSchemes = [
        {
            SchemeId: "STD001",
            SchemeName: "Standard Billing",
            SchemeType: "Basic",
            Discount1: "5%",
            Discount2: "0%",
            AdvAmount: "0"
        },
        {
            SchemeId: "ADV001",
            SchemeName: "Advance Billing Scheme",
            SchemeType: "Advance",
            Discount1: "12%",
            Discount2: "3%",
            AdvAmount: "10,000"
        },
        {
            SchemeId: "FST001",
            SchemeName: "Festival Offer",
            SchemeType: "Basic",
            Discount1: "8%",
            Discount2: "2%",
            AdvAmount: "0"
        },
        {
            SchemeId: "BLK001",
            SchemeName: "Bulk Purchase Scheme",
            SchemeType: "Advance",
            Discount1: "15%",
            Discount2: "5%",
            AdvAmount: "25,000"
        }
    ];

    return {
        getSchemes: function () {
            return aSchemes;
        },

        getSchemeById: function (sSchemeId) {
            return aSchemes.filter(function (oScheme) {
                return oScheme.SchemeId === sSchemeId;
            })[0] || null;
        }
    };
});
