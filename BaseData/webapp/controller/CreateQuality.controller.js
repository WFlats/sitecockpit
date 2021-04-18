sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.CreateQuality", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				qualityID: "",
				qualityPath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createQualityView");
			this.getRouter().getTargets().getTarget("CreateQuality").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("QualityTypes", {
					ID: sObjectId
				});
			this.getModel("createQualityView").setProperty("/mode", sMode);
			this.getModel("createQualityView").setProperty("/qualityID", sObjectId);
			this.getModel("createQualityView").setProperty("/qualityPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createQualityView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editQualityViewTitle"));
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
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createQualityViewTitle"));
				var oContext = oModel.createEntry("QualityTypes");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var sRank = this.byId("rank").getValue(),
				sDescription = this.byId("description").getValue(),
				bSaveEnabled = false;
			if (this.getModel("createQualityView").getProperty("/mode") === "Create") {
				if (sRank && sDescription) {
					bSaveEnabled = true;
				}
			} else { //Edit
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sRank !== "" && sDescription !== "") {
					if (Number(sRank) !== oData.number || sDescription !== oData.description) {
						bSaveEnabled = true;
					}
				}
			}
			this.getModel("createQualityView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sRank = this.byId("rank").getValue(),
				sDescription = this.byId("description").getValue(),
				that = this;

			this._isCodeUnique(sRank).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createQualityView").getProperty("/mode") === "Edit" && Number(sRank) === oModel.getProperty("number", oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same rank is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("rankNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
								//styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					if (!oModel.setProperty("number", Number(sRank), oBC) || !oModel.setProperty("description", sDescription, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createQualityView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
									//styleClass: that.getOwnerComponent().getContentDensityClass()
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
				sConfirmTitle = this.getResourceBundle().getText("qualityDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("qualityDeleteConfirmationText"),
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
			if (this.getModel("createQualityView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getModel("createQualityView").setProperty("/enableSave", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Quality");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/QualityTypes",
				aFilter = [new Filter({
					path: "number",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: Number(sCode)
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