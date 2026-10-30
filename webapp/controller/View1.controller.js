
/* eslint-disable max-params */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Token",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/GroupHeaderListItem",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Table"
], (Controller, Fragment, BusyIndicator, 
    JSONModel, Filter, FilterOperator, Token,
     MessageToast, MessageBox, GroupHeaderListItem,
      TableColumn, Label, Text, MobileColumn, ColumnListItem,
       MobileTable) => {
    "use strict";
    return Controller.extend("com.zeel.billingscheme.billingscheme.controller.View1", {
        onInit() {

            this.getView().setModel(new JSONModel({

                items: [],

                postingComplete: false,
                clearingAvailable: false,
                clearing: false,
                clearingComplete: false,
                clearingPayload: null,

                posting: false,

                transactionCurrency: "",

                itemCount: 0,

                deliveryCount: 0,

                hasDeliveryNumbers: false,

                schemeDetails: null,

                schemeType: "regular",

                schemeSelectedText: "",

                schemeSummaryText: "",

                hasSchemeDetails: false,

                billingItems: [],

                billingTotal: 0,
                billingTotalBeforeRoundOff: 0,
                taxableTotal: 0,
                gstTotal: 0,
                roundOff: 0,
                advanceUsed: 0,
                advanceRemaining: 0,
                excelAdvanceBalance: 0,
                customerPendingAmount: 0,
                fifoGrossOpening: 0,
                fifoGrossRemaining: 0,

                schemeValid: true,

                schemeErrorText: ""

            }));



            this._mDeliveryGroupInfo = {};

            this._sDeliveryValueHelpAnchorFullName = null;



            this._attachDeliveryPasteHandler();

        },

        _attachDeliveryPasteHandler() {

            var oInput = this.byId("deliveryInput");
            if (!oInput) {
                return;
            }
            this._fnDeliveryPasteHandler = this._onDeliveryInputPaste.bind(this);
            oInput.addEventDelegate({

                onAfterRendering: function () {

                    var oDomRef = oInput.getFocusDomRef();
                    if (oDomRef) {

                        oDomRef.removeEventListener("paste", this._fnDeliveryPasteHandler, true);
                        oDomRef.addEventListener("paste", this._fnDeliveryPasteHandler, true);

                    }

                }.bind(this)
            }, this);
        },

        _onDeliveryInputPaste(oNativeEvent) {
            var oClipboardData = oNativeEvent.clipboardData || window.clipboardData;
            var sText = oClipboardData ? oClipboardData.getData("text") : "";
            var aValues = this._splitDeliveryNumbers(sText);
            if (!aValues.length) {

                return;

            }

            oNativeEvent.preventDefault();
            oNativeEvent.stopPropagation();
            oNativeEvent.stopImmediatePropagation();

            var iAdded = this._addDeliveryNumbers(aValues);
            this._syncDeliveryState();

            if (iAdded) {
                MessageToast.show(iAdded + " delivery number(s) added from paste.");

            }

        },



        // ---------------------------------------------------------------

        // Delivery number entry (typed)

        // ---------------------------------------------------------------



        onDeliverySubmit(oEvent) {
            var sValue = oEvent.getParameter("value") || "";
            var oInput = oEvent.getSource();
            var iAdded = this._addDeliveryNumbers(this._splitDeliveryNumbers(sValue));

            oInput.setValue("");

            if (iAdded === 0 && sValue.trim()) {
                MessageToast.show("Delivery number already added or invalid.");
            }

            this._syncDeliveryState();
        },

        onDeliveryTokenUpdate() {
            setTimeout(this._syncDeliveryState.bind(this), 0);
        },

        onClearDeliveryInput() {
            var oInput = this.byId("deliveryInput");
            if (oInput) {
                oInput.removeAllTokens();
                oInput.setValue("");
                this._syncDeliveryState();
            }
        },

        onClearAll() {
            MessageBox.warning("Clear all delivery numbers, selected schemes, and billing details? This will discard the current entries.", {
                title: "Clear billing details?",

                actions: ["Clear", MessageBox.Action.CANCEL],

                emphasizedAction: MessageBox.Action.CANCEL,

                initialFocus: MessageBox.Action.CANCEL,

                onClose: function (sAction) {

                    if (sAction === "Clear") {

                        this._clearAll();

                    }

                }.bind(this)

            });

        },



        onNewBilling() {

            this._clearAll();

        },



        _clearAll() {

            var oInput = this.byId("deliveryInput");



            if (oInput) {

                oInput.removeAllTokens();

                oInput.setValue("");

            }



            var oModel = this.getView().getModel();



            oModel.setProperty("/postingComplete", false);
            oModel.setProperty("/clearingAvailable", false);
            oModel.setProperty("/clearing", false);
            oModel.setProperty("/clearingComplete", false);
            oModel.setProperty("/clearingPayload", null);

            oModel.setProperty("/items", []);

            oModel.setProperty("/transactionCurrency", "");

            oModel.setProperty("/itemCount", 0);

            oModel.setProperty("/deliveryCount", 0);

            oModel.setProperty("/schemeDetails", null);

            oModel.setProperty("/schemeType", "regular");

            this._mDeliveryGroupInfo = {};

            oModel.setProperty("/schemeSelectedText", "");

            oModel.setProperty("/schemeSummaryText", "");

            oModel.setProperty("/hasSchemeDetails", false);

            oModel.setProperty("/billingItems", []);

            oModel.setProperty("/billingTotal", 0);
            oModel.setProperty("/billingTotalBeforeRoundOff", 0);
            oModel.setProperty("/taxableTotal", 0);
            oModel.setProperty("/gstTotal", 0);
            oModel.setProperty("/roundOff", 0);
            oModel.setProperty("/advanceUsed", 0);
            oModel.setProperty("/advanceRemaining", 0);
            oModel.setProperty("/excelAdvanceBalance", 0);
            oModel.setProperty("/customerPendingAmount", 0);
            oModel.setProperty("/fifoGrossOpening", 0);
            oModel.setProperty("/fifoGrossRemaining", 0);

            oModel.setProperty("/schemeValid", true);

            oModel.setProperty("/schemeErrorText", "");



            this._syncDeliveryState();

            MessageToast.show("Cleared.");

        },



        _splitDeliveryNumbers(sRaw) {

            return String(sRaw || "")

                .split(/[,;\n\r\t ]+/)

                .map(function (sValue) {

                    return sValue.trim().toUpperCase();

                })

                .filter(function (sValue) {

                    return !!sValue;

                });

        },



        _addDeliveryNumbers(aValues) {

            var oInput = this.byId("deliveryInput");



            if (!oInput) {

                return 0;

            }



            var mExisting = {};



            oInput.getTokens().forEach(function (oToken) {

                mExisting[oToken.getKey()] = true;

            });



            var iAdded = 0;



            (aValues || []).forEach(function (sValue) {

                if (!sValue || mExisting[sValue]) {

                    return;

                }



                mExisting[sValue] = true;

                iAdded++;



                oInput.addToken(new Token({

                    key: sValue,

                    text: sValue

                }));

            });



            return iAdded;

        },



        _syncDeliveryState() {

            var oInput = this.byId("deliveryInput");

            var oModel = this.getView().getModel();



            if (!oInput || !oModel) {

                return;

            }



            var sDeliverySelection = JSON.stringify(oInput.getTokens().map(function (oToken) {
                return oToken.getKey();
            }).sort());
            if (this._sDeliverySelection !== sDeliverySelection) {
                this._sDeliverySelection = sDeliverySelection;
                this._resetDeliveryScheme();
            }
            oModel.setProperty("/hasDeliveryNumbers", oInput.getTokens().length > 0);

        },



        // ---------------------------------------------------------------

        // Delivery number F4 value help

        // ---------------------------------------------------------------



        _configureValueHelpTable(oDialog, oTable, sModel, sPath, aFields) {

            oTable.setModel(oDialog.getModel(sModel), sModel);

            // ValueHelpDialog also reads row contexts through the default model.

            oTable.setModel(oDialog.getModel(sModel));

            if (!oTable.data("selectionRestoreAttached")) {

                oTable.data("selectionRestoreAttached", true);

                oDialog.attachUpdateSelection(function (oEvent) {

                    this._restoreValueHelpSelection(oDialog, oTable, oEvent.getParameter("tokenKeys"));

                }, this);

                if (oTable.attachRowsUpdated) {

                    oTable.attachRowsUpdated(function () { oDialog.update(); });

                } else {

                    oTable.attachUpdateFinished(function () { oDialog.update(); });

                }

            }

            oTable.destroyColumns();

            var fnCell = function (aField) {

                return new Text({ text: { path: aField[0],

                    formatter: aField[3] ? aField[3].bind(this) : undefined } });

            }.bind(this);

            aFields.forEach(function (aField) {

                if (oTable.bindRows) {

                    oTable.addColumn(new TableColumn({ label: new Label({ text: aField[1] }),

                        template: fnCell(aField), width: aField[2], sortProperty: aField[0] }));

                } else {

                    oTable.addColumn(new MobileColumn({ header: new Label({ text: aField[1] }), width: aField[2] }));

                }

            });

            if (oTable.bindRows) {

                oTable.bindRows({ path: sPath });

            } else {

                oTable.bindItems({ path: sPath, templateShareable: false,

                    template: new ColumnListItem({ cells: aFields.map(fnCell) }) });

            }

            (oTable.getBinding("rows") || oTable.getBinding("items")).attachDataReceived(function () { oDialog.update(); });

        },



        _restoreValueHelpSelection(oDialog, oTable, aKeys) {

            var sKeyField = oDialog.getKey();

            var fnKey = function (vKey) {

                var sKey = String(vKey === null ? "" : vKey);

                return sKeyField === "DeliveryDocument" ? sKey.replace(/^0+(?=\d)/, "") : sKey;

            };

            var oKeys = new Set((aKeys || []).map(fnKey));

            if (oTable.bindRows) {

                var oBinding = oTable.getBinding("rows");

                oTable.clearSelection();

                if (!oBinding) { return; }

                // OData V4 has no aKeys/aIndices for the dialog's default update logic.

                oBinding.getCurrentContexts().forEach(function (oContext, iIndex) {

                    if (oContext && oKeys.has(fnKey(oContext.getProperty(sKeyField)))) {

                        var iRow = oContext.getIndex ? oContext.getIndex() : iIndex;

                        oTable.addSelectionInterval(iRow, iRow);

                    }

                });

            } else {

                oTable.getItems().forEach(function (oItem) {

                    var oContext = oItem.getBindingContext();

                    oTable.setSelectedItem(oItem, !!oContext && oKeys.has(fnKey(oContext.getProperty(sKeyField))));

                });

            }

        },



        _filterValueHelp(sPrefix, aFields, oTable, mOperators) {

            var aFilters = aFields.map(function (sField) {

                var sValue = this.byId(sPrefix + "Filter" + sField).getValue().trim();

                return sValue ? new Filter(sField, (mOperators && mOperators[sField]) || FilterOperator.Contains, sValue) : null;

            }.bind(this)).filter(Boolean);

            (oTable.getBinding("rows") || oTable.getBinding("items")).filter(aFilters);

            this.byId(sPrefix + "ValueHelpDialog").update();

        },



        _clearValueHelpFilters(sPrefix, aFields) {

            aFields.forEach(function (sField) { this.byId(sPrefix + "Filter" + sField).setValue(""); }.bind(this));

        },



        onDeliveryValueHelpRequest() {

            var oView = this.getView();

            if (!this._pDeliveryValueHelpDialog) {

                this._pDeliveryValueHelpDialog = Fragment.load({ id: oView.getId(),

                    name: "com.zeel.billingscheme.billingscheme.fragment.DeliveryValueHelpDialog", controller: this

                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    return oDialog.getTableAsync().then(function (oTable) {

                        this._oDeliveryValueHelpTable = oTable;

                        this._configureValueHelpTable(oDialog, oTable, "deliveryService", "/delivery_vh", [

                            ["DeliveryDocument", "Delivery Document", "20%"], ["Plant", "Plant", "12%"],

                            ["PlantName", "Plant Name", "24%"], ["Customer", "Customer", "16%"],

                            ["FullName", "Customer Name", "28%"]

                        ]);

                        return oDialog;

                    }.bind(this));

                }.bind(this));

            }

            this._pDeliveryValueHelpDialog.then(function (oDialog) {

                // The input is the committed selection; dialog edits are discarded on Cancel.

                oDialog.setTokens(this.byId("deliveryInput").getTokens().map(function (oToken) {

                    var sKey = oToken.getKey().replace(/^0+(?=\d)/, "");

                    return new Token({ key: sKey, text: oToken.getText() });

                }));

                this.onDeliveryValueHelpSearch();

                oDialog.open();

                oDialog.update();

            }.bind(this));

        },



        onDeliveryValueHelpSearch() {

            this._filterValueHelp("delivery", ["DeliveryDocument", "Plant", "PlantName", "Customer", "FullName"], this._oDeliveryValueHelpTable);

        },



        onDeliveryValueHelpClear() {

            this._clearValueHelpFilters("delivery", ["DeliveryDocument", "Plant", "PlantName", "Customer", "FullName"]);

            this.onDeliveryValueHelpSearch();

        },



        async onDeliveryValueHelpConfirm(oEvent) {

            var oDialog = oEvent.getSource();

            var aValues = (oEvent.getParameter("tokens") || []).map(function (oToken) { return oToken.getKey(); });

            var oBinding;

            oDialog.setBusy(true);

            try {

                if (aValues.length) {

                    oBinding = this.getView().getModel("deliveryService").bindList("/delivery_vh", null, null,

                        [new Filter({ filters: aValues.map(function (sValue) {

                            return new Filter("DeliveryDocument", FilterOperator.EQ, sValue);

                        }), and: false })]);

                    var aContexts = await oBinding.requestContexts(0, aValues.length);

                    var aRows = aContexts.map(function (oContext) { return oContext.getObject(); });

                    if (aRows.length !== aValues.length) {

                        MessageBox.error("Please select valid delivery documents.");

                        return;

                    }

                    if (aRows.some(function (oRow) { return (oRow.FullName || "") !== (aRows[0].FullName || ""); })) {

                        MessageBox.error("Please select delivery numbers for a single customer only.");

                        return;

                    }

                }

                this.byId("deliveryInput").removeAllTokens();

                this._addDeliveryNumbers(aValues.map(function (sValue) { return String(sValue).padStart(10, "0"); }));

                this._syncDeliveryState();

                oDialog.close();

            } catch (oError) {

                MessageBox.error("Could not validate deliveries: " + oError.message);

            } finally {

                oDialog.setBusy(false);

                if (oBinding) { oBinding.destroy(); }

            }

        },



        onDeliveryValueHelpCancel(oEvent) {

            oEvent.getSource().close();

        },



        formatDeliveryDocument(sValue) {

            return String(sValue || "").padStart(10, "0");

        },



        // ---------------------------------------------------------------

        // Excel / text upload

        // ---------------------------------------------------------------



        onOpenUploadDialog() {

            var oView = this.getView();



            if (!this._pUploadDialog) {

                this._pUploadDialog = Fragment.load({

                    id: oView.getId(),

                    name: "com.zeel.billingscheme.billingscheme.fragment.UploadDeliveryDialog",

                    controller: this

                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    return oDialog;

                });

            }



            this._pUploadDialog.then(function (oDialog) {

                oDialog.open();

            });

        },



        onCloseUploadDialog() {

            if (this._pUploadDialog) {

                this._pUploadDialog.then(function (oDialog) {

                    oDialog.close();

                });

            }

        },



        onDeliveryFileChange(oEvent) {

            var oUploader = oEvent.getSource();

            var aFiles = oEvent.getParameter("files") || [];

            var oFile = aFiles[0];



            if (!oFile) {

                return;

            }



            this.onCloseUploadDialog();

            this._processDeliveryFile(oFile);

            oUploader.clear();

        },



        _processDeliveryFile(oFile) {

            var sExtension = String(oFile.name || "").split(".").pop().toLowerCase();



            BusyIndicator.show(0);



            var pValues = sExtension === "txt" ?

                this._readValuesFromTextFile(oFile) :

                this._readValuesFromSpreadsheet(oFile);



            pValues

                .then(function (aValues) {

                    var iAdded = this._addDeliveryNumbers(aValues);



                    this._syncDeliveryState();



                    if (!aValues.length) {

                        MessageToast.show("No delivery numbers were found in the file.");

                    } else {

                        MessageToast.show(

                            iAdded + " delivery number(s) added" +

                            (aValues.length - iAdded > 0 ? ", " + (aValues.length - iAdded) + " duplicate(s) skipped." : ".")

                        );

                    }

                }.bind(this))

                .catch(function (oError) {

                    MessageBox.error("Could not read the file: " + (oError && oError.message ? oError.message : oError));

                })

                .finally(function () {

                    BusyIndicator.hide();

                });

        },



        _readValuesFromTextFile(oFile) {

            return oFile.text().then(function (sText) {

                return this._splitDeliveryNumbers(sText);

            }.bind(this));

        },



        _readValuesFromSpreadsheet(oFile) {

            return oFile.arrayBuffer().then(function (aBuffer) {

                var oWorkbook = window.XLSX.read(aBuffer, { type: "array" });

                var oSheet = oWorkbook.Sheets[oWorkbook.SheetNames[0]];

                var aRows = window.XLSX.utils.sheet_to_json(oSheet, { header: 1, defval: "" });

                var aValues = [];



                aRows.forEach(function (aRow) {

                    var sCell = String((aRow && aRow[0]) || "").trim();



                    if (sCell && !this._isDeliveryHeaderLabel(sCell)) {

                        aValues.push(sCell.toUpperCase());

                    }

                }.bind(this));



                return aValues;

            }.bind(this));

        },



        _isDeliveryHeaderLabel(sValue) {

            var sNormalized = sValue.trim().toUpperCase().replace(/[.:]/g, "");



            return ["DELIVERY", "DELIVERY NO", "DELIVERY NUMBER", "DN", "SR NO"].indexOf(sNormalized) !== -1;

        },



        // ---------------------------------------------------------------

        // Fetch delivery items (OData V4 read)

        // ---------------------------------------------------------------



        _resetDeliveryScheme() {
            this._iAdvanceCheckContext = (this._iAdvanceCheckContext || 0) + 1;
            this._iSchemeContext = (this._iSchemeContext || 0) + 1;
            var oModel = this.getView().getModel();
            oModel.setProperty("/schemeType", "regular");
            oModel.setProperty("/schemeDetails", null);
            oModel.setProperty("/schemeSelectedText", "");
            oModel.setProperty("/schemeSummaryText", "");
            oModel.setProperty("/hasSchemeDetails", false);
            this._rebuildBillingItems();
        },

        onFetchItems() {

            var oInput = this.byId("deliveryInput");

            var oModel = this.getView().getModel();



            if (!oInput) {

                return;

            }



            var aDeliveryNumbers = oInput.getTokens().map(function (oToken) {

                return oToken.getKey();

            });



            if (!aDeliveryNumbers.length) {

                MessageToast.show("Please enter at least one delivery number first.");

                return;

            }



            this._resetDeliveryScheme();
            BusyIndicator.show(0);



            // eslint-disable-next-line consistent-return
            return this._readDeliveryItems(aDeliveryNumbers)

                .then(function (aAllItems) {

                    var sValidationError = this._getDeliveryValidationError(aAllItems);

                    if (sValidationError) {

                        oModel.setProperty("/items", []);

                        oModel.setProperty("/itemCount", 0);

                        oModel.setProperty("/deliveryCount", 0);

                        this._mDeliveryGroupInfo = {};

                        this._rebuildBillingItems();

                        MessageBox.error(sValidationError, { title: "Delivery cannot be billed" });

                        return;

                    }

                    oModel.setProperty("/items", aAllItems);

                    oModel.setProperty("/itemCount", aAllItems.length);

                    oModel.setProperty("/deliveryCount", aDeliveryNumbers.length);



                    this._rebuildBillingItems();



                    MessageToast.show(

                        aAllItems.length ?

                            aAllItems.length + " line item(s) loaded for " + aDeliveryNumbers.length + " delivery number(s)." :

                            "No delivery items found for the entered delivery number(s)."

                    );

                    // eslint-disable-next-line consistent-return
                    return this._warnCustomerAdvances();

                }.bind(this))

                .catch(function (oError) {

                    MessageBox.error("Could not fetch delivery items: " + (oError && oError.message ? oError.message : oError));

                })

                .finally(function () {

                    BusyIndicator.hide();

                });

        },



        async _warnCustomerAdvances() {
            var sCustomerId = this._getSelectedCustomerId();
            var iContext = this._iAdvanceCheckContext;
            if (!sCustomerId || !this.getView().getModel().getProperty("/items").length) {
                return;
            }
            /* global Promise */
            var aResults = await Promise.allSettled([
                this._readSchemes(sCustomerId, "advance"),
                this._readSchemes(sCustomerId, "npAdvance")
            ]);
            if (this._iAdvanceCheckContext !== iContext || this._getSelectedCustomerId() !== sCustomerId) {
                return;
            }

            var bWsp = aResults[0].status === "fulfilled" && aResults[0].value.length > 0;
            var bNp = aResults[1].status === "fulfilled" && aResults[1].value.length > 0;
            var bFailed = aResults.some(function (oResult) { return oResult.status === "rejected"; });
            if (bWsp || bNp) {
                // eslint-disable-next-line no-nested-ternary
                var sAdvance = bWsp ? (bNp ? "WSP and NP advances are" : "WSP advance is") : "NP advance is";
                MessageBox.warning(sAdvance + " available for the selected customer (" + sCustomerId + "). " +
                    (bWsp ? "WSP advance has priority. " : "") +
                    "You can select any scheme as per your preference." +
                    (bFailed ? " Availability of the other advance type could not be checked." : ""), {
                    title: "Customer advance available"
                });
            } else if (bFailed) {
                MessageBox.warning("Could not check advance availability for the selected customer. " +
                    "You can still select a scheme as per your preference.");
            }
        },

        _getDeliveryValidationError(aItems) {

            var aPgiPending = [];

            var aInvoiced = [];

            (aItems || []).forEach(function (oItem) {

                if (!String(oItem.billingDocumentDate || "").trim() && aPgiPending.indexOf(oItem.deliveryNumber) === -1) {

                    aPgiPending.push(oItem.deliveryNumber);

                }

                if (String(oItem.invoiceStatus || "").trim().toUpperCase() === "CREATED" && aInvoiced.indexOf(oItem.deliveryNumber) === -1) {

                    aInvoiced.push(oItem.deliveryNumber);

                }

            });

            var aErrors = [];

            if (aPgiPending.length) {

                aErrors.push("PGI pending: " + aPgiPending.join(", "));

            }

            if (aInvoiced.length) {

                aErrors.push("Invoice already created: " + aInvoiced.join(", "));

            }

            return aErrors.join("\n\n");

        },



        _readDeliveryItems(aDeliveryNumbers) {

            // get_delivery's declared OData key is just DeliveryDocument, but

            // the backend returns one row per line item - a delivery with

            // several items produces multiple rows sharing that same key,

            // so bindList()/requestContexts() throws "Duplicate key

            // predicate" the same way the Scheme entity did. Read the raw

            // JSON directly instead.

            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");



            var sFilter = aDeliveryNumbers.map(function (sDeliveryNumber) {

                return "DeliveryDocument eq '" + sDeliveryNumber.replace(/'/g, "''") + "'";

            }).join(" or ");



            var sUrl = sServiceUri + "get_delivery?$filter=" + encodeURIComponent(sFilter);



            return fetch(sUrl, {

                headers: { "Accept": "application/json" }

            }).then(function (oResponse) {

                if (!oResponse.ok) {

                    return oResponse.text().then(function (sText) {
                        throw new Error("HTTP " + oResponse.status + " requesting get_delivery: " +
                            (this._extractErrorMessage(sText) || oResponse.statusText || "Request failed"));
                    }.bind(this));

                }

                return oResponse.json();

            }.bind(this)).then(function (oData) {

                var aRawRows = (oData && oData.value) || [];



                return this._buildItemsFromDeliveryRows(aRawRows);

            }.bind(this));

        },



        _buildItemsFromDeliveryRows(aRawRows) {

            var mGroupCounts = {};

            var mGroupInfo = {};



            (aRawRows || []).forEach(function (oRow) {

                // Backend responses can drop leading zeros from

                // DeliveryDocument (e.g. "80000275"), but the backend's own

                // scheme-billing logic keys off the full 10-digit document

                // number - pad it back out before using it anywhere else.

                var sDeliveryNumber = String(oRow.DeliveryDocument || "").padStart(10, "0");



                mGroupCounts[sDeliveryNumber] = (mGroupCounts[sDeliveryNumber] || 0) + 1;



                if (!mGroupInfo[sDeliveryNumber]) {

                    mGroupInfo[sDeliveryNumber] = {

                        customerId: oRow.Customer || "",

                        customerName: oRow.customerName || "",

                        customerAddress: oRow.Address || ""

                    };

                }

            });



            Object.keys(mGroupCounts).forEach(function (sDeliveryNumber) {

                mGroupInfo[sDeliveryNumber].itemCount = mGroupCounts[sDeliveryNumber];

            });



            this._mDeliveryGroupInfo = mGroupInfo;

            // eslint-disable-next-line complexity
            var aItems = (aRawRows || []).map(function (oRow) {

                var sDeliveryNumber = String(oRow.DeliveryDocument || "").padStart(10, "0");



                return {

                    deliveryNumber: sDeliveryNumber,

                    deliveryDocumentItem: String(oRow.DeliveryDocumentItem || ""),

                    Incoterm: oRow.Incoterm ?? "",

                    paymentterm: oRow.paymentterm ?? "",

                    PriceLevel: oRow.PriceLevel ?? "",

                    product: oRow.Product || "",

                    productDescription: oRow.ProductDescription || "",

                    billingDocumentDate: oRow.PGIDate || "",

                    invoiceStatus: oRow.InvoiceStatus || "",

                    salesOrganization: oRow.SalesOrganization || "",

                    destinationCountry: oRow.DestinationCountry || "",

                    sdDocumentCategory: oRow.SDDocumentCategory || "",

                    color: oRow.Color || "",

                    size: oRow.ZSize || "",

                    brand: oRow.Brand || "",

                    hsnCode: oRow.HsnCode || "",

                    bag: Number(oRow.NumberOfBags) || 0,

                    pack: Number(oRow.NumberOfPacks) || 0,

                    qty: Number(oRow.Quantity) || 0,

                    unit: oRow.BaseUnit || "",

                    rate: Number(oRow.Rate) || 0,

                    transactionCurrency: oRow.TransactionCurrency || "",

                    gstRate: Number(oRow.GstRate) || 0,

                    customerId: oRow.Customer || "",

                    customerName: oRow.customerName || "",

                    customerAddress: oRow.Address || "",

                    quantityinbaseunit: oRow.quantityinbaseunit || 0,

                    actualUom: oRow.actualuom || ""

                };

            });



            aItems.sort(function (a, b) {

                if (a.deliveryNumber !== b.deliveryNumber) {

                    return a.deliveryNumber < b.deliveryNumber ? -1 : 1;

                }
                // eslint-disable-next-line no-nested-ternary
                return a.deliveryDocumentItem < b.deliveryDocumentItem ? -1 :

                    a.deliveryDocumentItem > b.deliveryDocumentItem ? 1 : 0;

            });
 


            aItems.forEach(function (oItem, iIndex) {

                oItem.srNo = iIndex + 1;

            });



            return aItems;

        },



        getDeliveryGroupHeader(oGroup) {

            var sDeliveryNumber = oGroup.key;

            var oInfo = (this._mDeliveryGroupInfo && this._mDeliveryGroupInfo[sDeliveryNumber]) || {};

            var sCount = oInfo.itemCount ? oInfo.itemCount + " item" + (oInfo.itemCount > 1 ? "s" : "") : "";

            var sTitle = "Delivery " + sDeliveryNumber + (sCount ? " (" + sCount + ")" : "");



            if (oInfo.customerName) {

                sTitle += "  •  " + oInfo.customerName;

            }



            if (oInfo.customerAddress) {

                sTitle += "  •  " + oInfo.customerAddress;

            }



            return new GroupHeaderListItem({

                title: sTitle,

                tooltip: oInfo.customerAddress || undefined,

                upperCase: false

            });

        },



        // ---------------------------------------------------------------

        // Scheme selection

        // ---------------------------------------------------------------



        async onSchemeTypeChange(oEvent) {

            var oModel = this.getView().getModel();

            var sType = oEvent.getSource().getSelectedKey();
            var iSchemeContext = this._iSchemeContext = (this._iSchemeContext || 0) + 1;

            oModel.setProperty("/schemeType", sType);

            oModel.setProperty("/schemeDetails", null);

            oModel.setProperty("/schemeSelectedText", "");

            oModel.setProperty("/schemeSummaryText", "");

            oModel.setProperty("/hasSchemeDetails", false);

            this._rebuildBillingItems();

            if (sType === "advance") {
                var sCustomerId = this._getSelectedCustomerId();
                if (!sCustomerId) {
                    MessageToast.show("Please fetch delivery items first to determine the customer.");
                    return;
                }

                var oView = this.getView();
                oView.setBusy(true);
                try {
                    var aSchemes = await this._readSchemes(sCustomerId, sType);
                    if (this._iSchemeContext !== iSchemeContext || oModel.getProperty("/schemeType") !== sType ||
                        this._getSelectedCustomerId() !== sCustomerId) {
                        return;
                    }
                    this._applySelectedSchemes(this._getWspAutoSelectedSchemes(aSchemes));
                    if (!aSchemes.length) {
                        MessageToast.show("No WSP Advance schemes found for this customer.");
                    }
                } catch (oError) {
                    MessageBox.error("Could not fetch schemes: " + (oError && oError.message ? oError.message : oError));
                } finally {
                    oView.setBusy(false);
                }
            }

        },



        onSchemeValueHelpRequest() {

            var oView = this.getView();

            var sSchemeType = oView.getModel().getProperty("/schemeType");
            var iSchemeContext = this._iSchemeContext;

            var sCustomerId = this._getSelectedCustomerId();



            if (!sSchemeType) {

                MessageToast.show("Please select a scheme type first.");

                return;

            }



            if ((sSchemeType === "advance" || sSchemeType === "npAdvance") && !sCustomerId) {

                MessageToast.show("Please fetch delivery items first to determine the customer.");

                return;

            }



            if (!this._pSchemeValueHelpDialog) {

                this._pSchemeValueHelpDialog = Fragment.load({

                    id: oView.getId(),

                    name: "com.zeel.billingscheme.billingscheme.fragment.SchemeValueHelpDialog",

                    controller: this

                }).then(function (oDialog) {

                    oView.addDependent(oDialog);

                    oDialog.setModel(new JSONModel([]), "schemes");

                    // Use explicit selection controls on every screen size.
                    // The generated desktop grid has no radio-button mode.
                    oDialog.setTable(new MobileTable({
                        mode: "MultiSelect",
                        includeItemInSelection: true,
                        growing: true,
                        growingThreshold: 100
                    }));

                    return oDialog.getTableAsync().then(function (oTable) {

                        this._oSchemeValueHelpTable = oTable;

                        return oDialog;

                    }.bind(this));

                }.bind(this));

            }



            this._pSchemeValueHelpDialog.then(function (oDialog) {
                if (this._iSchemeContext !== iSchemeContext) {
                    return;
                }
                oDialog._iSchemeContext = iSchemeContext;

                oDialog.getModel("schemes").setData([]);

                oDialog.setTokens([]);

                this._configureSchemeValueHelpTable(oDialog, sSchemeType);

                this.onSchemeValueHelpClear();

                oDialog.open();

                oDialog.setBusy(true);



                (sSchemeType === "regular" ? this._readRegularSchemes() : this._readSchemes(sCustomerId, sSchemeType))

                    .then(function (aSchemes) {
                        if (this._iSchemeContext !== iSchemeContext) {
                            oDialog.close();
                            return;
                        }

                        // eslint-disable-next-line no-param-reassign
                        aSchemes = aSchemes.map(function (oScheme) {

                            return Object.assign({}, oScheme, { ValueHelpKey: this._getSchemeValueHelpKey(oScheme) });

                        }.bind(this));

                        oDialog.getModel("schemes").setData(aSchemes);

                        var oDetails = oView.getModel().getProperty("/schemeDetails");

                        // eslint-disable-next-line no-nested-ternary
                        var aSelected = oDetails ? (oDetails.SelectedSchemes || [oDetails]) :
                            (sSchemeType === "advance" ? this._getWspAutoSelectedSchemes(aSchemes) : []);

                        var aKeys = aSelected.map(this._getSchemeValueHelpKey.bind(this));

                        oDialog.setTokens(aSchemes.filter(function (oScheme) {

                            return aKeys.indexOf(oScheme.ValueHelpKey) !== -1;

                        }).map(function (oScheme) {

                            return new Token({ key: oScheme.ValueHelpKey, text: oScheme.SchemeName });

                        }));

                        oDialog.update();

                    }.bind(this))

                    .catch(function (oError) {

                        MessageBox.error("Could not fetch schemes: " + (oError && oError.message ? oError.message : oError));

                    })

                    .finally(function () {

                        oDialog.setBusy(false);

                    });

            }.bind(this));

        },



        _readRegularSchemes() {

            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");



            return fetch(sServiceUri + "regular_scheme", {

                headers: { "Accept": "application/json" }

            }).then(function (oResponse) {

                if (!oResponse.ok) {

                    throw new Error("HTTP " + oResponse.status);

                }

                return oResponse.json();

            }).then(function (oData) {

                return ((oData && oData.value) || []).map(function (oRow) {

                    return {

                        SrNo: oRow.SrNo,

                        SchemeId: oRow.SchemeId || "",

                        SchemeName: oRow.SchemeName,

                        SchemeType: oRow.SchemeType || "REGULAR",

                        Discount1: (Number(oRow.DisA) || 0) + "%",

                        Discount2: "0%",

                        ValidTill: oRow.ValidTill,

                        AdvAmount: 0,

                        Currency: "INR"

                    };

                });

            });

        },



        _readSchemes(sCustomerId, sSchemeType) {

            // The backend's Scheme entity set fans out one row per Customer

            // for the same underlying document (its declared OData key is

            // just AccountingDocument/AccountingDocumentItem/PostingDate),

            // so two customers sharing a scheme produce duplicate key

            // predicates. Reading it via bindList()/requestContexts() makes

            // the OData v4 model build a keyed cache and throw "Duplicate

            // key predicate" on those rows. We only need the scheme

            // definition (not a live-bound entity), so read the raw JSON

            // directly instead and de-duplicate on the client - keyed by

            // document/item/customer so distinct customers on the same

            // document each keep their own row (needed now that both are

            // shown as columns).

            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");



            var aFilters = [];

            if (sCustomerId) {
                aFilters.push("Customer eq '" + String(sCustomerId).replace(/'/g, "''") + "'");
            }

            aFilters.push(sSchemeType === "npAdvance" ?
                "scheme_type eq 'NP ADVANCE'" :
                "(scheme_type eq 'ADVANCE' or scheme_type eq 'WSP ADVANCE')");

            var sFilter = "?$filter=" + encodeURIComponent(aFilters.join(" and "));

            var sUrl = sServiceUri + "Scheme" + sFilter;



            var fnReadPage = async function (sPageUrl) {
                var oResponse = await fetch(sPageUrl, {
                    headers: { "Accept": "application/json" }
                });
                if (!oResponse.ok) {
                    throw new Error("HTTP " + oResponse.status);
                }
                var oData = await oResponse.json();
                var aRows = (oData && oData.value) || [];
                if (oData && oData["@odata.nextLink"]) {
                    var sNextUrl = new URL(oData["@odata.nextLink"],
                        new URL(sPageUrl, document.baseURI)).href;
                    aRows = aRows.concat(await fnReadPage(sNextUrl));
                }
                return aRows;
            };

            return fnReadPage(sUrl).then(function (aRows) {

                var mSeen = {};

                var aSchemes = [];



                aRows.forEach(function (oRow) {

                    var sDedupeKey = [oRow.AccountingDocument, oRow.AccountingDocumentItem, oRow.Customer, oRow.scheme_type].join("|");



                    if (mSeen[sDedupeKey]) {

                        return;

                    }

                    mSeen[sDedupeKey] = true;



                    aSchemes.push({

                        SchemeId: oRow.SchemeId || "",

                        AccountingDocument: oRow.AccountingDocument,

                        AccountingDocumentItem: oRow.AccountingDocumentItem,

                        PostingDate: oRow.PostingDate || "",

                        SchemeName: oRow.SchemeName,

                        SchemeType: oRow.scheme_type,

                        Discount1: oRow.DiscountA + "%",

                        Discount2: oRow.DiscountB + "%",

                        AdvAmount: oRow.Amount,

                        Currency: oRow.CompanyCodeCurrency,

                        // Not yet in the API response - defaults to blank

                        // until the backend adds it.

                        CustomerName: oRow.customerName || ""

                    });

                });



                return aSchemes;

            });

        },



        _getSchemeValueHelpKey(oScheme) {

            return JSON.stringify([oScheme.SrNo, oScheme.SchemeId, oScheme.AccountingDocument,

                oScheme.AccountingDocumentItem, oScheme.SchemeName, oScheme.SchemeType]);

        },



        _configureSchemeValueHelpTable(oDialog, sType) {

            var bMultiselect = sType === "advance" || sType === "npAdvance";
            oDialog.setSupportMultiselect(bMultiselect);
            var oTable = this._oSchemeValueHelpTable;
            if (oTable.setSelectionMode) {
                oTable.setSelectionMode(bMultiselect ? "MultiToggle" : "Single");
            } else {
                oTable.setMode(bMultiselect ? "MultiSelect" : "SingleSelectLeft");
            }

            var aFields = sType === "regular" ? [

                ["SchemeName", "Scheme Name", "64%"],

                ["Discount1", "Discount 1", "18%", this._formatPercent],

                ["Discount2", "Discount 2", "18%", this._formatPercent]

            ] : [

                ["AccountingDocument", "Accounting Document", "24%"], ["SchemeName", "Scheme Name", "34%"],

                ["PostingDate", "Posting Date", "15%"],

                ["Discount1", "Discount 1", "8%", this._formatPercent],

                ["Discount2", "Discount 2", "8%", this._formatPercent],

                ["AdvAmount", "Advance Amount", "11%", this._formatAmount]

            ];

            this._configureValueHelpTable(oDialog, this._oSchemeValueHelpTable, "schemes", "/", aFields);

        },



        onSchemeValueHelpSearch() {

            var bAdvance = ["advance", "npAdvance"].includes(this.getView().getModel().getProperty("/schemeType"));

            var oDatePicker = this.byId("schemeFilterPostingDate");

            if (bAdvance && oDatePicker.getValue() && !oDatePicker.getDateValue()) {

                MessageToast.show("Please select a valid posting date.");

                return;

            }

            var aFields = bAdvance ? ["SchemeName", "AccountingDocument", "PostingDate"] : ["SchemeName"];

            this._filterValueHelp("scheme", aFields, this._oSchemeValueHelpTable, { PostingDate: FilterOperator.EQ });

        },



        onSchemePostingDateChange(oEvent) {

            if (!oEvent.getParameter("valid")) {

                MessageToast.show("Please select a valid posting date.");

                return;

            }

            this.onSchemeValueHelpSearch();

        },



        onSchemeValueHelpClear() {

            this._clearValueHelpFilters("scheme", ["SchemeName", "AccountingDocument", "PostingDate"]);

            this.onSchemeValueHelpSearch();

        },



        onSchemeValueHelpConfirm(oEvent) {

            var oDialog = oEvent.getSource();
            if (oDialog._iSchemeContext !== this._iSchemeContext) {
                oDialog.close();
                return;
            }

            var aAvailable = oDialog.getModel("schemes").getData();

            var aSchemes = (oEvent.getParameter("tokens") || []).map(function (oToken) {

                return aAvailable.find(function (oScheme) { return oScheme.ValueHelpKey === oToken.getKey(); });

            }).filter(Boolean);

            oDialog.close();

            this._applySelectedSchemes(aSchemes);
        },

        _getWspAutoSelectedSchemes(aSchemes) {
            var aItems = this.getView().getModel().getProperty("/items") || [];
            if (!aSchemes.length || !aItems.length) {
                return [];
            }

            var aOrdered = this._combineAdvanceSchemes(aSchemes, "advance").SelectedSchemes;
            var aSelected = [];
            for (var i = 0; i < aOrdered.length; i++) {
                aSelected.push(aOrdered[i]);
                // Each added scheme can change the highest Discount 1.
                // Calculate carry forward using only the selected prefix.
                var oCombined = this._combineAdvanceSchemes(aSelected, "advance");
                var fDiscount1 = this._parsePercent(oCombined.Discount1);
                var fNetValue = aItems.reduce(function (fTotal, oItem) {
                    return fTotal + (Number(oItem.rate) || 0) *
                        (1 - fDiscount1) * (Number(oItem.quantityinbaseunit) || 0);
                }, 0);
                var oCalculation = this._calculateAdvanceDiscount2(aSelected, fNetValue, aItems[0].gstRate);
                if (oCalculation.TotalAdvanceRemaining > 0) {
                    break;
                }
            }
            return aSelected;
        },

        _applySelectedSchemes(aSchemes) {
            var oModel = this.getView().getModel();
            var bAdvance = ["advance", "npAdvance"].includes(oModel.getProperty("/schemeType"));

            if (!aSchemes.length) {

                oModel.setProperty("/schemeDetails", null);

                oModel.setProperty("/schemeSelectedText", "");

                oModel.setProperty("/schemeSummaryText", "");

                oModel.setProperty("/hasSchemeDetails", false);

                this._rebuildBillingItems();

                return;

            }



            var oSchemeDetails = bAdvance ? this._combineAdvanceSchemes(aSchemes, oModel.getProperty("/schemeType")) : aSchemes[0];



            oModel.setProperty("/schemeDetails", oSchemeDetails);
            oModel.setProperty("/schemeSelectedText", oSchemeDetails.SchemeName + " (" + oSchemeDetails.SchemeType + ")");
            oModel.setProperty("/schemeSummaryText", this._formatSchemeSummary(oSchemeDetails));
            oModel.setProperty("/hasSchemeDetails", true);

            this._rebuildBillingItems();
            MessageToast.show("Scheme selected: " + oSchemeDetails.SchemeName);

        },



     _combineAdvanceSchemes(aSchemes, sSchemeType) {

    // Priority:
    // WSP: highest Discount 2 first, then oldest Posting Date.
    // NP: oldest Posting Date first, regardless of Discount 2.

    // eslint-disable-next-line no-param-reassign
    aSchemes = aSchemes.slice().sort(function (oFirst, oSecond) {

        var fFirstDiscount2 = this._parsePercent(oFirst.Discount2);
        var fSecondDiscount2 = this._parsePercent(oSecond.Discount2);

        // Highest Discount 2 first
        if (sSchemeType !== "npAdvance" && fFirstDiscount2 !== fSecondDiscount2) {
            return fSecondDiscount2 - fFirstDiscount2;
        }

        // NP, or equal WSP Discount 2: oldest Posting Date first
        return String(oFirst.PostingDate || "9999-12-31")
            .localeCompare(
                String(oSecond.PostingDate || "9999-12-31")
            );

    }.bind(this));

    var fMaxDiscount1 = 0;
    var fAdvance = 0;

    aSchemes.forEach(function (oScheme) {

        fMaxDiscount1 = Math.max(
            fMaxDiscount1,
            this._parsePercent(oScheme.Discount1) * 100
        );

        fAdvance += Math.abs(
            this._parseAmount(oScheme.AdvAmount)
        );

    }.bind(this));

    return {
        SchemeName: aSchemes.map(function (oScheme) {
            return oScheme.SchemeName;
        }).join(", "),

        SchemeType: "ADVANCE",
        Discount1: fMaxDiscount1 + "%",
        Discount2: "0%",
        Discount2Amount: 0,
        AdvAmount: this._round2(fAdvance),
        Currency: aSchemes[0].Currency || "INR",
        SelectedSchemes: aSchemes,
        SchemeCalculations: []
    };
},
        _calculateAdvanceDiscount2(aSchemes, fNetValue, fGstRate) {
            // Source: SAP Scheme CD Working (2).xlsx, "With GST".
            // H12 = NetAfterDiscount1 * (1 + GST)
            // Upper CD is supplied by the API, e.g. 10.80, 8.70, 7.53.
            // The workbook displays these rounded upper limits but calculates
            // them from lower limits 9.75, 8.00, 7.00 respectively:
            //   lowerPct = ROUND(upperPct / (1 + upperPct / 100), 2)
            //   exactUpperRate = lowerRate / (1 - lowerRate)
            // Gross face value of an advance = Advance / (1 - lowerRate).
            // FIFO takes MIN(gross balance, gross face value).
            // CD including GST = gross taken * lowerRate.
            // CD excluding GST = CD including GST * (1 - 4.76/100).
            // 4.76% is intentional: the workbook uses 4.76%, not 5/105.
            // Credit limit is ZERO and is not part of FIFO.
            var fGst = (Number(fGstRate) || 0) / 100;
            var fOpeningGross = Math.max(0, fNetValue) * (1 + fGst);
            var fBalance = fOpeningGross;
            var fAdvanceUsedTotal = 0;
            var fCashDiscountTotal = 0;
            var fGrossCashDiscountTotal = 0;
            var fTotalAdvancePrincipal = 0;
            var fTotalAdvanceFaceValue = 0;
            var fGrossCapacityConsumed = 0;

            var aCalculations = (aSchemes || []).map(function (oScheme) {
                var fAdvance = Math.abs(this._parseAmount(oScheme.AdvAmount));
                var fUpperPct = this._parsePercent(oScheme.Discount2) * 100;
                // The upper rate stored by SAP is generally rounded to 2
                // decimals. Recover the precise rate from the 2-decimal
                // lower rate to match Excel J3:J5 / L3:L5.
                var fLowerPct = this._round2(fUpperPct / (1 + fUpperPct / 100));
                var fLowerRate = fLowerPct / 100;
                var fExactUpperRate = fLowerRate > 0 && fLowerRate < 1 ?
                    fLowerRate / (1 - fLowerRate) : 0;
                var fGrossCapacity = fAdvance * (1 + fExactUpperRate);
                var fGrossUsed = Math.min(Math.max(0, fBalance), fGrossCapacity);
                var fGrossCD = fGrossUsed * fLowerRate;
                var fNetCD = fGrossCD * (1 - 0.0476);
                var fPrincipalUsed = Math.min(fAdvance, Math.max(0, fGrossUsed - fGrossCD));

                fBalance = Math.max(0, fBalance - fGrossUsed);
                fTotalAdvancePrincipal += fAdvance;
                fTotalAdvanceFaceValue += fGrossCapacity;
                fGrossCapacityConsumed += fGrossUsed;
                fAdvanceUsedTotal += fPrincipalUsed;
                fGrossCashDiscountTotal += fGrossCD;
                fCashDiscountTotal += fNetCD;

                return {
                    AccountingDocument: oScheme.AccountingDocument || "",
                    PostingDate: oScheme.PostingDate || "",
                    SchemeName: oScheme.SchemeName || "",
                    AdvanceAmount: fAdvance,
                    UpperDiscount2Percent: fUpperPct,
                    LowerDiscount2Percent: fLowerPct,
                    ExactUpperDiscount2Percent: fExactUpperRate * 100,
                    AdvanceGrossCapacity: this._round8(fGrossCapacity),
                    AdvanceGrossUsed: this._round8(fGrossUsed),
                    AdvanceUsed: this._round8(fPrincipalUsed),
                    AdvanceLeftover: this._round8(Math.max(0, fAdvance - fPrincipalUsed)),
                    GrossDiscount2Amount: this._round8(fGrossCD),
                    // Backend and taxable value receive CD WITHOUT GST.
                    CalculatedDiscount2Amount: this._round8(fNetCD),
                    GrossBalanceAfter: this._round8(fBalance)
                };
            }.bind(this));

            return {
                GrossOpening: this._round8(fOpeningGross),
                GrossBalanceRemaining: this._round8(fBalance),
                GrossDiscount2Amount: this._round8(fGrossCashDiscountTotal),
                Discount2Amount: this._round8(fCashDiscountTotal),
                TotalAdvancePrincipal: this._round2(fTotalAdvancePrincipal),
                TotalAdvanceUsed: this._round8(fAdvanceUsedTotal),
                TotalAdvanceRemaining: this._round8(Math.max(0,
                    fTotalAdvancePrincipal - fAdvanceUsedTotal)),
                // Remaining gross advance capacity. Credit limit = 0.
                ExcelCustomerAdvanceBalance: this._round8(Math.max(0,
                    fTotalAdvanceFaceValue - fGrossCapacityConsumed)),
                SchemeCalculations: aCalculations
            };
        },

        onSchemeValueHelpCancel(oEvent) {

            oEvent.getSource().close();

        },



        _getSelectedCustomerId() {

            if (!this._mDeliveryGroupInfo || !Object.keys(this._mDeliveryGroupInfo).length) {

                return null;

            }

            var aDeliveryKeys = Object.keys(this._mDeliveryGroupInfo);

            return this._mDeliveryGroupInfo[aDeliveryKeys[0]].customerId || null;

        },



        _formatSchemeSummary(oSchemeDetails) {

             

            // eslint-disable-next-line no-param-reassign
            oSchemeDetails = oSchemeDetails || {};



            if (String(oSchemeDetails.SchemeType).toUpperCase() === "REGULAR") {

                return "Scheme: " + oSchemeDetails.SchemeName +

                    // "  |  Type: " + oSchemeDetails.SchemeType +

                    "  |  Discount 1: " + this._formatPercent(oSchemeDetails.Discount1) +

                    "  |  Valid Till: " + (oSchemeDetails.ValidTill || "");

            }



            var sResult = "Scheme: " + oSchemeDetails.SchemeName +
              //  "  |  Type: " + oSchemeDetails.SchemeType +
                "  |  Discount 1: " + this._formatPercent(oSchemeDetails.Discount1) +
                "  |  Discount 2: " + (oSchemeDetails.SelectedSchemes ?
                    this._formatAmount(oSchemeDetails.Discount2Amount) + " " + (this.getView().getModel().getProperty("/transactionCurrency") || "") : this._formatPercent(oSchemeDetails.Discount2)) +
                "  |  Adv Amount: " + this._formatAmount(oSchemeDetails.AdvAmount);

            if (oSchemeDetails.SelectedSchemes && oSchemeDetails.SchemeCalculations &&
                    oSchemeDetails.SchemeCalculations.length) {
                sResult += "  |  Advance Used: " + this._formatAmount(oSchemeDetails.TotalAdvanceUsed) +
                    "  |  Carry Forward: " + this._formatAmount(oSchemeDetails.TotalAdvanceRemaining);
            }

            // if (oSchemeDetails.SelectedSchemes && oSchemeDetails.SchemeCalculations &&
            //         oSchemeDetails.SchemeCalculations.length) {
            //     sResult += "  |  Advance Balance (Excel): " +
            //         this._formatAmount(oSchemeDetails.ExcelCustomerAdvanceBalance) +
            //         "  |  Customer Pending: " + this._formatAmount(oSchemeDetails.CustomerPendingAmount);
            // }
            return sResult;

        },



        // ---------------------------------------------------------------

        // ---------------------------------------------------------------
        // Discount 1: highest percentage from selected advances (unchanged).
        // Discount 2: oldest advance first, consuming GST-inclusive balance.
        // CD without GST reduces taxable value; GST is recalculated on taxable.
        // Regular schemes retain their existing calculation formula.
        // ---------------------------------------------------------------

        // eslint-disable-next-line max-statements
        _rebuildBillingItems() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var oScheme = oModel.getProperty("/schemeDetails");
            var bAdvance = !!(oScheme && oScheme.SelectedSchemes);

            oModel.setProperty("/transactionCurrency", aItems.length ? aItems[0].transactionCurrency || "" : "");
            oModel.setProperty("/billingItems", []);
            oModel.setProperty("/billingTotal", 0);
            oModel.setProperty("/billingTotalBeforeRoundOff", 0);
            oModel.setProperty("/taxableTotal", 0);
            oModel.setProperty("/gstTotal", 0);
            oModel.setProperty("/roundOff", 0);
            oModel.setProperty("/advanceUsed", 0);
            oModel.setProperty("/advanceRemaining", 0);
            oModel.setProperty("/excelAdvanceBalance", 0);
            oModel.setProperty("/customerPendingAmount", 0);
            oModel.setProperty("/fifoGrossOpening", 0);
            oModel.setProperty("/fifoGrossRemaining", 0);
            oModel.setProperty("/schemeValid", true);
            oModel.setProperty("/schemeErrorText", "");

            if (!aItems.length || !oScheme) {
                return;
            }

            var fDisc1 = this._parsePercent(oScheme.Discount1);
            var fDisc2 = this._parsePercent(oScheme.Discount2);
            var fGstPct = Number(aItems[0].gstRate) || 0;
            if (bAdvance && aItems.some(function (oItem) {
                return Math.abs((Number(oItem.gstRate) || 0) - fGstPct) > 0.000001;
            })) {
                oModel.setProperty("/schemeValid", false);
                oModel.setProperty("/schemeErrorText",
                    "GST-inclusive FIFO requires the same GST percentage for all delivery items.");
                return;
            }

            var aValuesAfterDisA = aItems.map(function (oItem) {
                var fRate = Number(oItem.rate) || 0;
                var fQty = Number(oItem.quantityinbaseunit) || 0;
                if (bAdvance) {
                    // Excel O4 = L4 * (1 - N4/100), P4 = O4 * J4.
                    // Retain sub-paise decimals; cell formatting is NOT rounding.
                    return fRate * (1 - fDisc1) * fQty;
                }
                // Preserve the former regular-scheme calculation.
                return this._round2(this._round2(fRate * (1 - fDisc1)) * fQty);
            }.bind(this));
            var fNetAfterDisA = aValuesAfterDisA.reduce(function (v, n) { return v + n; }, 0);
            var oFifo = null;
            if (bAdvance) {
                oFifo = this._calculateAdvanceDiscount2(oScheme.SelectedSchemes, fNetAfterDisA, fGstPct);
                oScheme.Discount2Amount = oFifo.Discount2Amount;
                oScheme.SchemeCalculations = oFifo.SchemeCalculations;
                oScheme.TotalAdvanceUsed = oFifo.TotalAdvanceUsed;
                oScheme.TotalAdvanceRemaining = oFifo.TotalAdvanceRemaining;
                oScheme.ExcelCustomerAdvanceBalance = oFifo.ExcelCustomerAdvanceBalance;
                oScheme.GrossBalanceRemaining = oFifo.GrossBalanceRemaining;
                oScheme.GrossDiscount2Amount = oFifo.GrossDiscount2Amount;
                oScheme.TotalAdvancePrincipal = oFifo.TotalAdvancePrincipal;
                oModel.setProperty("/schemeDetails", oScheme);
                oModel.setProperty("/advanceUsed", oFifo.TotalAdvanceUsed);
                oModel.setProperty("/advanceRemaining", oFifo.TotalAdvanceRemaining);
                oModel.setProperty("/excelAdvanceBalance", oFifo.ExcelCustomerAdvanceBalance);
                oModel.setProperty("/fifoGrossOpening", oFifo.GrossOpening);
                oModel.setProperty("/fifoGrossRemaining", oFifo.GrossBalanceRemaining);
            }

            // The Excel defines only the overall net-of-GST CD, not line-wise CD. Keep the
            // existing proportional allocation for the screen and posting,
            // but preserve the precision of the exact overall FIFO result.
            var iLast = -1;
            aValuesAfterDisA.forEach(function (fValue, i) { if (fValue > 0) { iLast = i; } });
            var fDistributedCashDiscount = 0;
            var aBillingItems = aItems.map(function (oItem, iIndex) {
                var fRate = Number(oItem.rate) || 0;
                var fQty = Number(oItem.quantityinbaseunit) || 0;
                var fAfterA = aValuesAfterDisA[iIndex];
                var fRateAfterA = bAdvance ? fRate * (1 - fDisc1) : this._round2(fRate * (1 - fDisc1));
                var fRateAfterB = this._round2(fRateAfterA * (1 - fDisc2));
                var fAfterB = this._round2(fRateAfterB * fQty);
                var fItemCD = 0;

                if (bAdvance) {
                    if (fNetAfterDisA > 0 && fAfterA > 0) {
                        fItemCD = iIndex === iLast ?
                            oScheme.Discount2Amount - fDistributedCashDiscount :
                            oScheme.Discount2Amount * (fAfterA / fNetAfterDisA);
                    }
                    fDistributedCashDiscount += fItemCD;
                    fAfterB = fAfterA - fItemCD;
                    fRateAfterB = fQty ? fAfterB / fQty : 0;
                }

                var fItemGstPct = Number(oItem.gstRate) || 0;
                var fItemGST = bAdvance ? fAfterB * (fItemGstPct / 100) :
                    this._round2(fAfterB * (fItemGstPct / 100));
                var fItemTotal = bAdvance ? fAfterB + fItemGST : this._round2(fAfterB + fItemGST);
                return {
                    srNo: oItem.srNo,
                    qty: oItem.qty,
                    unit: oItem.unit,
                    quantityinbaseunit: oItem.quantityinbaseunit,
                    actualUom: oItem.actualUom,
                    rate: oItem.rate,
                    schemeName: oScheme.SchemeName,
                    schemeType: oScheme.SchemeType,
                    discount1: oScheme.Discount1,
                    transactionCurrency: oItem.transactionCurrency || "",
                    discount2: bAdvance ? this._formatAmount(fItemCD) + " " + (oItem.transactionCurrency || "") : oScheme.Discount2,
                    discount2Amount: fItemCD,
                    // eslint-disable-next-line no-nested-ternary
                    discount2Percent: bAdvance ? (fAfterA > 0 ? fItemCD / fAfterA * 100 : 0) : fDisc2 * 100,
                    rateAfterDisA: fRateAfterA,
                    valueAfterDisA: fAfterA,
                    rateAfterDisB: fRateAfterB,
                    valueAfterDisB: fAfterB,
                    gstRate: fItemGstPct,
                    gstPercent: fItemGstPct + "%",
                    gstValue: fItemGST,
                    total: fItemTotal
                };
            }.bind(this));

            var fTaxable, fGST, fBeforeRoundOff, fInvoiceTotal, fRoundOff;
            if (bAdvance) {
                // Excel P12:P15: sum the unrounded values, then ROUND(...,0).
                fTaxable = fNetAfterDisA - oScheme.Discount2Amount;
                fGST = fTaxable * (fGstPct / 100);
                fBeforeRoundOff = fTaxable + fGST;
                fInvoiceTotal = Math.round(fBeforeRoundOff);
                fRoundOff = fInvoiceTotal - fBeforeRoundOff;

                oScheme.CustomerPendingAmount = Math.max(0,
                    this._round2(fInvoiceTotal - oFifo.TotalAdvanceUsed));
                oModel.setProperty("/customerPendingAmount", oScheme.CustomerPendingAmount);
                oModel.setProperty("/schemeDetails", oScheme);
                oModel.setProperty("/schemeSummaryText", this._formatSchemeSummary(oScheme));

                // Approval phase: no invoice eligibility check against
                // selected advances or credit limit. Credit limit is 0 and
                // excluded from FIFO/Discount 2 calculations.
                // The advance + credit limit restriction will be added
                // separately after the calculation logic is approved.
            } else {
                fTaxable = aBillingItems.reduce(function (s, item) { return s + item.valueAfterDisB; }, 0);
                fGST = aBillingItems.reduce(function (s, item) { return s + item.gstValue; }, 0);
                fBeforeRoundOff = this._round2(fTaxable + fGST);
                fInvoiceTotal = fBeforeRoundOff;
                fRoundOff = 0;
            }

            oModel.setProperty("/billingItems", aBillingItems);
            oModel.setProperty("/taxableTotal", this._round8(fTaxable));
            oModel.setProperty("/gstTotal", this._round8(fGST));
            oModel.setProperty("/billingTotalBeforeRoundOff", this._round8(fBeforeRoundOff));
            oModel.setProperty("/roundOff", this._round8(fRoundOff));
            oModel.setProperty("/billingTotal", fInvoiceTotal);
        },

        _parsePercent(sValue) {

            var fValue = parseFloat(String(sValue || "0").replace("%", ""));



            return isNaN(fValue) ? 0 : fValue / 100;

        },



        _round2(fValue) {

            return Math.round((fValue + Number.EPSILON) * 100) / 100;

        },



        _round3(fValue) {
            return Math.round((fValue + Number.EPSILON) * 1000) / 1000;
        },

        _round8(fValue) {
            return Math.round((fValue + Number.EPSILON) * 100000000) / 100000000;
        },

        _parseAmount(sValue) {

            var fValue = parseFloat(String(sValue || "0").replace(/,/g, ""));



            return isNaN(fValue) ? 0 : fValue;

        },



        _formatAmount(fValue) {

            return this._parseAmount(fValue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        },



        _formatPercent(sValue) {

            return this._formatAmount(this._parsePercent(sValue) * 100) + "%";

        },



        _formatQuantity(fQuantity, sUnit) {

            return this._formatAmount(fQuantity) + (sUnit ? " " + sUnit : "");

        },



        _formatBag(sUnit, fQuantity, fBag) {

            return this._formatAmount(String(sUnit || "").toUpperCase() === "BAG" ? fQuantity : fBag);

        },



        _formatDiscount2(sValue, sSchemeType) {

            return (sSchemeType === "advance" || sSchemeType === "npAdvance") ? sValue : this._formatPercent(sValue);

        },



        _formatDate(oDate) {

            var sYear = oDate.getFullYear();

            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");

            var sDay = String(oDate.getDate()).padStart(2, "0");



            return sYear + "-" + sMonth + "-" + sDay;

        },



        // ---------------------------------------------------------------

        // Post scheme billing

        // ---------------------------------------------------------------



        onPostScheme() {

            var oModel = this.getView().getModel();

            if (oModel.getProperty("/postingComplete") || oModel.getProperty("/posting")) {

                return;

            }

            var aBillingItems = oModel.getProperty("/billingItems") || [];



            if (!aBillingItems.length) {

                MessageToast.show("Fetch delivery items and select a scheme before posting.");

                return;

            }



            if (!oModel.getProperty("/schemeValid")) {
                MessageBox.error(oModel.getProperty("/schemeErrorText") || "Scheme calculation is invalid.");
                return;
            }

            var oPayload = this._buildSchemeBillingPayload();
            var sValidationError = this._getDeliveryValidationError(oModel.getProperty("/items"));

            if (sValidationError) {
                MessageBox.error(sValidationError, { title: "Delivery cannot be billed" });
                return;
            }

            oModel.setProperty("/posting", true);
            BusyIndicator.show(0);

            this._postSchemeBilling(oPayload)
                .then(function (oResult) {
                    BusyIndicator.hide();
                    this._showSchemeBillingResult(oResult);
                }.bind(this))

                .catch(function (oError) {
                    BusyIndicator.hide();
                    MessageBox.error("Could not post scheme billing: " + (oError && oError.message ? oError.message : oError));
                })

                .finally(function () {
                    oModel.setProperty("/posting", false);
                });
        },

        _showSchemeBillingResult(oResult) {
            // eslint-disable-next-line no-param-reassign
            oResult = oResult || {};

            var sStatus = String(oResult.ProcessStatus || "UNKNOWN").trim().toUpperCase();
            var aLines = ["Status: " + sStatus];

            if (oResult.CurrentStep) { aLines.push("Current step: " + oResult.CurrentStep); }
            ["PreliminaryBillingDocument", "PricingDocument", "FinalBillingDocument"].forEach(function (sField) {
                if (oResult[sField]) { aLines.push(sField + ": " + oResult[sField]); }
            });

            var bFailed = sStatus === "ERROR" || sStatus === "FAILED" || sStatus === "FAILURE";

            ["CreatePBD", "Discount1", "Discount2"].forEach(function (sStep) {
                var sStepStatus = String(oResult[sStep + "Status"] || "").trim().toUpperCase();
                if (["ERROR", "FAILED", "FAILURE"].indexOf(sStepStatus) !== -1) { bFailed = true; }
                if (sStepStatus || oResult[sStep + "Message"]) {
                    aLines.push(sStep + " [" + sStepStatus + "]: " + (oResult[sStep + "Message"] || ""));
                }

            });

            (oResult.SAP__Messages || []).forEach(function (oMessage) {
                if (oMessage.message) { aLines.push(oMessage.message); }
            });

            var sMessage = aLines.join("\n\n");

            if (bFailed) {
                MessageBox.error(sMessage, { title: "Billing failed" });
            } else if (["SUCCESS", "PROCESSING", "JOB_SCHEDULED", "SKIPPED"].includes(sStatus)) {
                this.getView().getModel().setProperty("/postingComplete", true);
                var oModel = this.getView().getModel();
                var bJobScheduled = sStatus === "JOB_SCHEDULED" ||
                    String(oResult.CurrentStep || "").trim().toUpperCase() === "JOB_SCHEDULED";
                var bCanClear = bJobScheduled &&
                    ["advance", "npAdvance"].includes(oModel.getProperty("/schemeType"));
                if (bCanClear) {
                    oModel.setProperty("/clearingPayload", this._buildCustomerClearingPayload(oResult));
                    oModel.setProperty("/clearingAvailable", true);
                    oModel.setProperty("/clearingComplete", false);
                }
                MessageBox.success(sMessage, {
                    title: "Billing successful",
                    actions: bCanClear ? ["Clear Customer Account", "Close"] : ["Close"],
                    onClose: function (sAction) {
                        if (sAction === "Clear Customer Account") {
                            this.onClearCustomerAccount();
                        }
                    }.bind(this)
                });
            } else {
                MessageBox.warning(sMessage, { title: "Billing status not confirmed" });
            }
        },
        _buildCustomerClearingPayload(oResult) {
            var oModel = this.getView().getModel();
            var oScheme = oModel.getProperty("/schemeDetails") || {};
            return {
                BillingDocument: oResult.PreliminaryBillingDocument || "",
                Customer: this._getSelectedCustomerId() || "",
                InvoiceAmount: this._round2(Number(oModel.getProperty("/billingTotal")) || 0),
                Advances: (oScheme.SelectedSchemes || []).map(function (oAdvance) {
                    return {
                        Document: oAdvance.AccountingDocument || "",
                        Amount: this._round2(Math.abs(this._parseAmount(oAdvance.AdvAmount)))
                    };
                }.bind(this))
            };
        },

        async onClearCustomerAccount() {
            var oModel = this.getView().getModel();
            if (!oModel.getProperty("/clearingAvailable") || oModel.getProperty("/clearing") ||
                oModel.getProperty("/clearingComplete")) {
                return;
            }
            var oPayload = oModel.getProperty("/clearingPayload");
            if (!oPayload || !oPayload.BillingDocument || !oPayload.Customer ||
                !oPayload.Advances.length || oPayload.Advances.some(function (oAdvance) { return !oAdvance.Document; })) {
                MessageBox.error("Cannot clear customer account: PBD, customer or selected advance document is missing.");
                return;
            }
            oModel.setProperty("/clearing", true);
            try {
                var oResult = await this._postCustomerClearing(oPayload);
                var sStatus = String(oResult.Status || "").trim().toUpperCase();
                var sMessage = (oResult.Message || "No message returned.") +
                    "\n\nBilling Document: " + (oResult.BillingDocument || oPayload.BillingDocument);
                if (sStatus === "S") {
                    oModel.setProperty("/clearingComplete", true);
                    MessageBox.success(sMessage, { title: "Customer account cleared" });
                } else if (sStatus === "W") {
                    MessageBox.warning(sMessage, { title: "Customer account clearing warning" });
                } else {
                    MessageBox.error(sMessage, { title: "Customer account clearing failed" });
                }
            } catch (oError) {
                MessageBox.error("Could not clear customer account: " + oError.message);
            } finally {
                oModel.setProperty("/clearing", false);
            }
        },

        async _postCustomerClearing(oPayload) {
            // The existing /sap proxy routes this path to the configured S/4 host.
            var sUrl = "/sap/bc/http/sap/zhttp_schemeclearing";
            var mHeaders = { "Content-Type": "application/json", "Accept": "application/json" };
            var oResponse = await fetch(sUrl, {
                method: "POST",
                headers: mHeaders,
                body: JSON.stringify(oPayload)
            });
            if (!oResponse.ok) {
                throw new Error(this._extractErrorMessage(await oResponse.text()) || ("HTTP " + oResponse.status));
            }
            return await oResponse.json();
        },

        _buildSchemeBillingPayload() {
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items") || [];
            var aBillingItems = oModel.getProperty("/billingItems") || [];
            var oScheme = oModel.getProperty("/schemeDetails") || {};
            var aSchemes = oScheme.SelectedSchemes || [oScheme];
            var fDiscount1 = this._parsePercent(oScheme.Discount1) * 100;
            var mSeen = {};
            var aDeliveries = [];
            // eslint-disable-next-line complexity
            var aPostItems = aItems.map(function (oItem, iIndex) {
                var oBill = aBillingItems[iIndex] || {};
                var fQty = Number(oItem.quantityinbaseunit) || 0;
                if (!mSeen[oItem.deliveryNumber]) {
                    mSeen[oItem.deliveryNumber] = true;
                    aDeliveries.push({
                        DeliveryDocument: oItem.deliveryNumber,
                        BillingDocumentType: "",
                        BillingDocumentDate: oItem.billingDocumentDate || "",
                        SalesOrganization: oItem.salesOrganization || "",
                        DestinationCountry: oItem.destinationCountry || "",
                        SDDocumentCategory: "J",
                        Customer: oItem.customerId || ""
                    });

                }

                return {
                    DeliveryDocument: oItem.deliveryNumber,
                    DeliveryDocumentItem: "",
                    Product: oItem.product || "",
                    ProductDescription: "",
                    Customer: oItem.customerId || "",
                    Color: oItem.color || "",
                    ProductSize: oItem.size || "",
                    Brand: oItem.brand || "",
                    HSNCode: oItem.hsnCode || "",
                    Bag: String(oItem.unit).toUpperCase() === "BAG" ? oItem.qty : oItem.bag,
                    Pack: oItem.pack || 0,
                    Quantity: fQty,
                    QuantityUnit: oItem.actualUom || "",
                    OriginalRate: oItem.rate,
                    Discount1Percent: fDiscount1,
                    Discount1Amount: oScheme.SelectedSchemes ? oItem.rate * fDiscount1 / 100 : this._round2(oItem.rate * fDiscount1 / 100),
                    RateAfterDiscount1: oBill.rateAfterDisA,
                    ValueAfterDiscount1: oBill.valueAfterDisA,
                    Discount2Amount: oScheme.SelectedSchemes ? this._round8(oBill.discount2Amount) : this._round2(oBill.valueAfterDisA - oBill.valueAfterDisB),
                    RateAfterDiscount2: fQty ? Math.round((oBill.valueAfterDisB / fQty + Number.EPSILON) * 1000) / 1000 : 0,
                    ValueAfterDiscount2: oBill.valueAfterDisB,
                    GSTPercent: oBill.gstRate,
                    GSTAmount: oBill.gstValue,
                    FinalRate: fQty ? Math.round((oBill.total / fQty + Number.EPSILON) * 1000) / 1000 : 0,
                    FinalAmount: oBill.total
                };
            }.bind(this));
            var sum = function (sField) {
                return this._round2(aPostItems.reduce(function (fTotal, oItem) {
                    return fTotal + (oItem[sField] || 0);
                }, 0));
            }.bind(this);
            var oPayload = {
                SchemeType: String(oScheme.SchemeType || oModel.getProperty("/schemeType") || "").toUpperCase(),
                TransactionCurrency: aItems.length ? aItems[0].transactionCurrency || "" : "",
                Discount1Percent: fDiscount1,
                Discount2Amount: oScheme.SelectedSchemes ? oModel.getProperty("/schemeDetails").Discount2Amount : sum("Discount2Amount"),
                BillingTotal: oScheme.SelectedSchemes ? oModel.getProperty("/taxableTotal") : sum("ValueAfterDiscount2"),
                GSTAmount: oScheme.SelectedSchemes ? oModel.getProperty("/gstTotal") : sum("GSTAmount"),
                GrandTotal: oScheme.SelectedSchemes ? oModel.getProperty("/billingTotal") : sum("FinalAmount"),
                _Deliveries: aDeliveries,
                _Schemes: aSchemes.map(function (oSelected, iIndex) {
                    var fAdvance = Math.abs(this._parseAmount(oSelected.AdvAmount));
                    var fDis2 = this._parsePercent(oSelected.Discount2) * 100;
                    return {
                        accountingdocument: oSelected.AccountingDocument || "",
                        SchemeName: oSelected.SchemeName || "",
                        Discount1Percent: this._parsePercent(oSelected.Discount1) * 100,
                        Discount2Percent: fDis2,
                        AdvanceAmount: fAdvance,
                        CalculatedDiscount2Amount: oScheme.SchemeCalculations ?
                            oScheme.SchemeCalculations[iIndex].CalculatedDiscount2Amount : this._round2(fAdvance * fDis2 / 100)
                    };
                }.bind(this)),
                _Items: aPostItems

            };

            return oPayload;
        },
        _prepareSchemeBillingPayload(oPayload) {
            var oMetaModel = this.getView().getModel("deliveryService").getMetaModel();
            var fnPrepare = function (oEntry, sPath) {
                return oMetaModel.requestObject(sPath + "/").then(function (oType) {
                    if (!oType) {
                        throw new Error("Could not read billing field precision from service metadata: " + sPath);
                    }
                    var oPrepared = {};
                    return Promise.all(Object.keys(oEntry).map(function (sField) {
                        var vValue = oEntry[sField];
                        var oProperty = oType[sField];
                        if (Array.isArray(vValue)) {
                            return Promise.all(vValue.map(function (oChild) {
                                return fnPrepare(oChild, sPath + "/" + sField);
                            })).then(function (aChildren) { oPrepared[sField] = aChildren; });
                        }
                        if (oProperty && oProperty.$Type === "Edm.Decimal" && vValue !== null && vValue !== undefined) {
                            var iScale = oProperty.$Scale === undefined ? 0 : oProperty.$Scale;
                            var fValue = Number(vValue);
                            if (!Number.isFinite(fValue)) {
                                throw new Error("Invalid numeric value for " + sPath + "/" + sField);
                            }
                            // Fixed scales come from metadata; variable scales retain their precision.
                            vValue = typeof iScale === "number" ? Number(fValue.toFixed(iScale)) : fValue;
                        }
                        oPrepared[sField] = vValue;
                        return Promise.resolve();
                    })).then(function () { return oPrepared; });
                });
            };
            return fnPrepare(oPayload, "/BillingScheme");
        },
        _postSchemeBilling(oPayload) {
            var sServiceUri = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/deliveryService/uri");
            var sActionUrl = sServiceUri + "BillingScheme";

            return Promise.all([
                this._fetchCsrfToken(sServiceUri),
                this._prepareSchemeBillingPayload(oPayload)
            ]).then(function (aResults) {
                var sToken = aResults[0];
                return fetch(sActionUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "X-CSRF-Token": sToken
                    },
                    body: JSON.stringify(aResults[1])
                });

            }).then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error(this._extractErrorMessage(sText) || ("HTTP " + oResponse.status));
                    }.bind(this));

                }
                return oResponse.status === 204 ? null : oResponse.json();
            }.bind(this));
        },

        _extractErrorMessage(sText) {
            if (!sText) {
                return "";
            }

            try {
                var oBody = JSON.parse(sText);
                return oBody.Message ||
                    (oBody.error && oBody.error.message && oBody.error.message.value) ||
                    (oBody.error && oBody.error.message) ||
                    sText;

            // eslint-disable-next-line no-unused-vars
            } catch (e) {
                return sText;
            }
        },
        _fetchCsrfToken(sServiceUri) {
            return fetch(sServiceUri + "$metadata", {
                method: "GET",
                headers: { "X-CSRF-Token": "Fetch" }
            }).then(function (oResponse) {
                return oResponse.headers.get("X-CSRF-Token") || "";
            });
        }
    });
});
