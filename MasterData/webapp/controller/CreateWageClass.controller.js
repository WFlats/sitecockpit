sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.CreateWageClass", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				wageClassID: "",
				owageClassPath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createWageClassView");
			this.getRouter().getTargets().getTarget("CreateWageClass").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "";
			if (sMode === "Edit") {
				sObjectPath = "/" + oModel.createKey("WageClasses", {
					ID: sObjectId
				});
			}
			this.getModel("createWageClassView").setProperty("/mode", sMode);
			this.getModel("createWageClassView").setProperty("/wageClassID", sObjectId);
			this.getModel("createWageClassView").setProperty("/wageClassPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createWageClassView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editWageClassViewTitle"));
				this.getView().bindElement({
					path: sObjectPath,
					events: {
						dataRequested: function () {
							oViewModel.setProperty("/busy", true);
						},
						dataReceived: function () {
							oViewModel.setProperty("/busy", false);
						}
					}
				});
			} else {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createWageClassViewTitle"));
				var oContext = oModel.createEntry("WageClasses");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var bSaveEnabled = false,
				sWageClass = this.byId("wageClass").getValue(),
				mRate = this.byId("rate").getValue(),
				sCurrency = this.byId("currency").getValue();
			this.getModel("createWageClassView").setProperty("/enableSave", bSaveEnabled);
			// check if required fields are filled
			if (sWageClass === "" || mRate === "" || sCurrency === "") {
				return;
			}
			if (this.getModel("createWageClassView").getProperty("/mode") === "Edit") {
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				// check if changes were made
				if (oData.wageClass !== sWageClass || oData.rate !== mRate || oData.currency_code !== sCurrency) {
					bSaveEnabled = true;
				}
			} else {
				bSaveEnabled = true;
			}
			this.getModel("createWageClassView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sWageClass = this.byId("wageClass").getValue(),
				sRate = this.byId("rate").getValue(),
				sCurrencyCode = this.byId("currency").getValue(),
				that = this;

			this._isCodeUnique(sWageClass).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createWageClassView").getProperty("/mode") === "Edit" && sWageClass === oModel.getProperty("wageClass",
						oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("wageClassNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
								//styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					// update oModel
					if (!oModel.setProperty("wageClass", sWageClass, oBC) || !oModel.setProperty("rate", parseFloat(sRate).toFixed(3), oBC) || !
						oModel.setProperty(
							"currency_code", sCurrencyCode, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createWageClassView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("wageClassDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("wageClassDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			this.getModel("createWageClassView").setProperty("/enableSave", false);
			if (this.getModel("createWageClassView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getView().unbindObject();
			this.getRouter().getTargets().display("WageClasses");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/WageClasses",
				aFilter = [new Filter({
					path: "wageClass",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		}

	});

});