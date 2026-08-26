sap.ui.define([], function () {
    "use strict";

    return {
        getSchemeDetails: function (sSchemeType) {
            var mSchemes = {
                BASIC: {
                    SchemeName: "Standard Billing",
                    SchemeType: "Basic",
                    Discount1: "5%",
                    Discount2: "0%",
                    AdvAmount: "0"
                },
                ADVANCE: {
                    SchemeName: "Advance Billing Scheme",
                    SchemeType: "Advance",
                    Discount1: "12%",
                    Discount2: "3%",
                    AdvAmount: "10,000"
                }
            };

            return mSchemes[String(sSchemeType || "").trim().toUpperCase()] || mSchemes.BASIC;
        }
    };
});
